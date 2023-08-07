const axios = require("axios");
const mysql = require("mysql2");

const apiKey = "eqM1mTFhhBIOgdK1Obq4xTiJhFxzXMAwv7xZtnwR";
const apiUrl = `https://tle.ivanstanojevic.me/api/tle/?api_key=${apiKey}`;

const mysqlConfig = {
  host: "127.0.0.1",
  user: "team_ed",
  password: "team_ed!@#123",
  port: 3306,
  database: "team_ed_user3",
};

let connection;

const logTableName = "tle_data_log";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTLE() {
  try {
    let page = 1;
    let hasNextPage = true;
    let pageCounter = 0;

    const fetchTime = new Date();
    const formattedFetchTime = fetchTime
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    while (hasNextPage) {
      pageCounter++;

      const response = await axios.get(`${apiUrl}&page=${page}`);
      const tleData = response.data;

      if (!tleData.member || tleData.member.length === 0) {
        hasNextPage = false;
        console.log("No more data found in API response.");
        break;
      }

      if (page % 10 === 0) {
        console.log(`Processing page ${page}`);
      }

      const extractedTLEData = processTLEData(
        tleData.member,
        formattedFetchTime
      );

      if (extractedTLEData.length > 0) {
        await saveTLEData(extractedTLEData, formattedFetchTime);
      } else {
        console.error("Processed TLE data is empty or invalid.");
      }

      await sleep(1000);

      page++;

      if (pageCounter === 100) {
        console.log(`Wait...`);
        await sleep(15 * 60 * 1000); // 100페이지마다 15분 대기
        pageCounter = 0;
      }
    }
  } catch (error) {
    console.error("Error fetching or saving TLE data:", error);
    console.log("Retrying in 1 hour...");

    if (connection && !connection._closed) {
      connection.end();
    }

    await sleep(60 * 60 * 1000);

    connection = mysql.createConnection(mysqlConfig);
    connection.connect((error) => {
      if (error) {
        console.error("Error connecting to the database:", error);
      } else {
        console.log("Reconnected to the MySQL database.");
        fetchTLE();
      }
    });
  }
}

function processTLEData(tleData, fetchTime) {
  const extractedTLEData = [];

  tleData.forEach((tle) => {
    const line1 = tle.line1;
    const line2 = tle.line2;

    if (line1 && line2) {
      const line1Fields = {
        satelliteNumber: line1.substr(2, 5),
        classification: line1.substr(7, 1),
        launch: line1.substr(9, 5),
        launchPiece: line1.substr(14, 1),
        epoch: line1.substr(18, 14),
        firstTimeDerivative: line1.substr(33, 10),
        secondTimeDerivative: line1.substr(44, 8),
        bstarDragTerm: line1.substr(53, 8),
        ephemerisType: line1.substr(62, 1),
        elementNumber: line1.substr(64, 4),
        checksum: line1.substr(68, 1),
      };

      const line2Fields = {
        inclination: line2.substr(8, 8),
        rightAscension: line2.substr(17, 8),
        eccentricity: line2.substr(26, 7),
        argumentOfPerigee: line2.substr(34, 8),
        meanAnomaly: line2.substr(43, 8),
        meanMotion: line2.substr(52, 11),
      };

      extractedTLEData.push({
        satellite_id: tle.satelliteId,
        name: tle.name,
        date: new Date(tle.date).toISOString().slice(0, 19).replace("T", " "),
        line1: tle.line1,
        line2: tle.line2,
        line1Fields: line1Fields,
        line2Fields: line2Fields,
        fetch_timestamp: fetchTime,
      });
    } else {
      console.error("Line data is not available for this TLE.");
    }
  });

  return extractedTLEData;
}

function saveTLEData(tleData, fetchTime) {
  const querySelect = "SELECT * FROM tle_data WHERE satellite_id = ?";
  const queryUpdate = "UPDATE tle_data SET ? WHERE satellite_id = ?";
  const queryInsert = "INSERT INTO tle_data SET ?";
  const queryInsertLog =
    "INSERT INTO tle_data_log (satellite_id, name, date, satellite_number, classification, launch, launch_piece, epoch, first_time_derivative, second_time_derivative, bstar_drag_term, ephemeris_type, element_number, checksum, inclination, right_ascension, eccentricity, argument_of_perigee, mean_anomaly, mean_motion, fetch_timestamp, changed_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

  tleData.forEach((tle) => {
    const satellite_id = tle.satellite_id;
    const name = tle.name;
    const date = tle.date;
    const line1Fields = tle.line1Fields;
    const line2Fields = tle.line2Fields;
    
    const changed_time = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    if (connection && !connection._closed) {
      connection.query(querySelect, [satellite_id], (error, results) => {
        if (error) {
          console.error("Error checking for existing satellite_id:", error);
        } else {
          if (results.length === 0) {
            connection.query(
              queryInsert,
              {
                satellite_id,
                name,
                date,
                satellite_number: line1Fields.satelliteNumber,
                classification: line1Fields.classification,
                launch: line1Fields.launch,
                launch_piece: line1Fields.launchPiece,
                epoch: line1Fields.epoch,
                first_time_derivative: line1Fields.firstTimeDerivative,
                second_time_derivative: line1Fields.secondTimeDerivative,
                bstar_drag_term: line1Fields.bstarDragTerm,
                ephemeris_type: line1Fields.ephemerisType,
                element_number: line1Fields.elementNumber,
                checksum: line1Fields.checksum,
                inclination: line2Fields ? line2Fields.inclination : null,
                right_ascension: line2Fields
                  ? line2Fields.rightAscension
                  : null,
                eccentricity: line2Fields ? line2Fields.eccentricity : null,
                argument_of_perigee: line2Fields
                  ? line2Fields.argumentOfPerigee
                  : null,
                mean_anomaly: line2Fields ? line2Fields.meanAnomaly : null,
                mean_motion: line2Fields ? line2Fields.meanMotion : null,
                fetch_timestamp: fetchTime,
              },
              (error, results) => {
                if (error) {
                  console.error("Error saving TLE data:", error);
                } else {
                  //console.log("TLE data saved successfully for:", name);
                }
              }
            );

            // tle_data_log 저장
            connection.query(
              queryInsertLog,
              [
                satellite_id,
                name,
                date,
                line1Fields.satelliteNumber,
                line1Fields.classification,
                line1Fields.launch,
                line1Fields.launchPiece,
                line1Fields.epoch,
                line1Fields.firstTimeDerivative,
                line1Fields.secondTimeDerivative,
                line1Fields.bstarDragTerm,
                line1Fields.ephemerisType,
                line1Fields.elementNumber,
                line1Fields.checksum,
                line2Fields ? line2Fields.inclination : null,
                line2Fields ? line2Fields.rightAscension : null,
                line2Fields ? line2Fields.eccentricity : null,
                line2Fields ? line2Fields.argumentOfPerigee : null,
                line2Fields ? line2Fields.meanAnomaly : null,
                line2Fields ? line2Fields.meanMotion : null,
                fetchTime,
                changed_time,
              ],
              (error, results) => {
                if (error) {
                  console.error(
                    "Error saving TLE data to tle_data_log:",
                    error
                  );
                } else {
                  console.log(
                    "TLE data saved to tle_data_log successfully for:",
                    name
                  );
                }
              }
            );
          } else {
            const existingData = results[0];
            const newData = {
              name,
              date,
              satellite_number: line1Fields.satelliteNumber,
              classification: line1Fields.classification,
              launch: line1Fields.launch,
              launch_piece: line1Fields.launchPiece,
              epoch: line1Fields.epoch,
              first_time_derivative: line1Fields.firstTimeDerivative,
              second_time_derivative: line1Fields.secondTimeDerivative,
              bstar_drag_term: line1Fields.bstarDragTerm,
              ephemeris_type: line1Fields.ephemerisType,
              element_number: line1Fields.elementNumber,
              checksum: line1Fields.checksum,
              inclination: line2Fields ? line2Fields.inclination : null,
              right_ascension: line2Fields ? line2Fields.rightAscension : null,
              eccentricity: line2Fields ? line2Fields.eccentricity : null,
              argument_of_perigee: line2Fields
                ? line2Fields.argumentOfPerigee
                : null,
              mean_anomaly: line2Fields ? line2Fields.meanAnomaly : null,
              mean_motion: line2Fields ? line2Fields.meanMotion : null,
              fetch_timestamp: fetchTime,
            };

            const hasChanges =
              JSON.stringify(existingData) !== JSON.stringify(newData);

            if (hasChanges) {
              connection.query(
                queryUpdate,
                [{ ...newData }, satellite_id],
                (error, results) => {
                  if (error) {
                    console.error("Error updating TLE data:", error);
                  } else {
                    //console.log("TLE data updated successfully for:", name);
                  }
                }
              );

              // tle_data_log 테이블
              connection.query(
                queryInsertLog,
                [
                  satellite_id,
                  name,
                  date,
                  line1Fields.satelliteNumber,
                  line1Fields.classification,
                  line1Fields.launch,
                  line1Fields.launchPiece,
                  line1Fields.epoch,
                  line1Fields.firstTimeDerivative,
                  line1Fields.secondTimeDerivative,
                  line1Fields.bstarDragTerm,
                  line1Fields.ephemerisType,
                  line1Fields.elementNumber,
                  line1Fields.checksum,
                  line2Fields ? line2Fields.inclination : null,
                  line2Fields ? line2Fields.rightAscension : null,
                  line2Fields ? line2Fields.eccentricity : null,
                  line2Fields ? line2Fields.argumentOfPerigee : null,
                  line2Fields ? line2Fields.meanAnomaly : null,
                  line2Fields ? line2Fields.meanMotion : null,
                  fetchTime,
                  changed_time,
                ],
                (error, results) => {
                  if (error) {
                    console.error(
                      "Error saving TLE data to tle_data_log:",
                      error
                    );
                  } else {
                    //console.log("TLE data saved to tle_data_log successfully for:", name);
                  }
                }
              );
            } else {
              //console.log(`Skipping duplicate data for satellite_id: ${satellite_id}`);
            }
          }
        }
      });
    }
  });
}

async function run() {
  while (true) {
    console.log("Fetching TLE data from API...");
    await fetchTLE();
    await sleep(120 * 60 * 1000); // 120분마다 갱신
  }
}

connection = mysql.createConnection(mysqlConfig);
connection.connect((error) => {
  if (error) {
    console.error("Error connecting to the database:", error);
  } else {
    console.log("Connected to the MySQL database.");
    run();
  }
});
