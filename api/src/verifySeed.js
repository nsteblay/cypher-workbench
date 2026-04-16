
import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

async function verify() {
  const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
  const user = process.env.NEO4J_USER || "neo4j";
  const pass = process.env.NEO4J_PASSWORD || "password";
  const dbName = process.env.NEO4J_DATABASE || "neo4j";

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const session = driver.session({ database: dbName });

  try {
    const countResult = await session.run("MATCH (n) RETURN count(n) as count");
    console.log(`TOTAL NODES IN DATABASE: ${countResult.records[0].get('count')}`);

    const labelResult = await session.run("MATCH (n) RETURN labels(n)[0] as label, count(n) as count");
    console.log("LABELS FOUND:");
    labelResult.records.forEach(r => console.log(`  - ${r.get('label')}: ${r.get('count')}`));

    const result = await session.run("MATCH (u:User {email: 'admin'}) RETURN u.name as name, labels(u) as labels");
    if (result.records.length > 0) {
      const record = result.records[0];
      console.log(`FOUND ADMIN USER: ${record.get('name')}`);
    } else {
      console.log("ADMIN USER NOT FOUND");
    }

    const orgResult = await session.run("MATCH (org:SecurityOrganization) RETURN org.name as name");
    if (orgResult.records.length > 0) {
      console.log(`FOUND ORGANIZATIONS: ${orgResult.records.map(r => r.get('name')).join(', ')}`);
    } else {
      console.log("NO SECURITY ORGANIZATIONS FOUND");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await session.close();
    await driver.close();
  }
}

verify();
