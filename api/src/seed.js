
import fs from "fs";
import path from "path";
import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const CONSTRAINTS_PATH = path.join(__dirname, "../../docker/cw-config/cw-config/cw-db-setup/cypher_constraints_v4.4_to_5.cypher");
const INIT_DATA_PATH = path.join(__dirname, "../../docker/cw-config/cw-config/cw-db-setup/cypher_init_data.cypher");

async function runSeed() {
  const driverConfig = {
    disableLosslessIntegers: true
  };
  if (!process.env.NEO4J_URI.match(/bolt\+s/) && !process.env.NEO4J_URI.match(/neo4j\+s/)) {
    driverConfig.encrypted = (process.env.NEO4J_ENCRYPTED === "true") ? true : false;
  }

  const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
  const user = process.env.NEO4J_USER || "neo4j";
  const pass = process.env.NEO4J_PASSWORD || "password";
  const dbName = process.env.NEO4J_DATABASE || "neo4j";

  console.log(`Connecting to ${uri} (database: ${dbName})...`);

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), driverConfig);
  const session = driver.session({ database: dbName });

  try {
    // 0. Clear Database
    console.log("DELETING all existing nodes and relationships...");
    const clearResult = await session.run("MATCH (n) DETACH DELETE n");
    console.log("  Database cleared.");

    // 1. Run Constraints
    console.log("Reading constraints...");
    const constraintsContent = fs.readFileSync(CONSTRAINTS_PATH, "utf8");
    const constraintStatements = constraintsContent
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${constraintStatements.length} constraint/index statements...`);
    for (const stmt of constraintStatements) {
      try {
        await session.run(stmt);
        console.log(`  Executed: ${stmt.substring(0, 40)}...`);
      } catch (err) {
        if (err.code === "Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists" || 
            err.code === "Neo.ClientError.Schema.IndexAlreadyExists" ||
            err.code === "Neo.ClientError.Schema.ConstraintAlreadyExists") {
          console.log(`  Skipping existing constraint.`);
        } else {
          console.error(`  Error executing constraint: ${stmt}`);
          console.error(err);
        }
      }
    }

    // 2. Run Init Data
    console.log("Reading initialization data...");
    const initDataContent = fs.readFileSync(INIT_DATA_PATH, "utf8");
    // Split by ; but handle multi-line blocks correctly
    const dataStatements = initDataContent
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${dataStatements.length} data initialization blocks...`);
    for (const [index, stmt] of dataStatements.entries()) {
      try {
        console.log(`  Executing Block #${index + 1} (${stmt.length} chars)...`);
        const result = await session.run(stmt);
        const stats = result.summary.counters.updates();
        console.log(`    Nodes created: ${stats.nodesCreated}`);
        console.log(`    Labels added: ${stats.labelsAdded}`);
        console.log(`    Relationships created: ${stats.relationshipsCreated}`);
      } catch (err) {
        console.error(`  FATAL: Error executing data block #${index + 1}:`);
        console.error(stmt.substring(0, 200) + "...");
        console.error(err);
        throw err;
      }
    }

    console.log("SUCCESS: Database restored successfully.");
  } catch (err) {
    console.error("FAILURE: Database restoration failed.");
    console.error(err);
  } finally {
    await session.close();
    await driver.close();
  }
}

runSeed();
