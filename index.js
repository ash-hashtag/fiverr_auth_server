import { config } from "dotenv";
import crypto from "crypto";
import fastify from "fastify";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import { AccountAddress, createConcordiumClient } from "@concordium/node-sdk";
import { credentials } from "@grpc/grpc-js";
import tweetnacl from "tweetnacl";
import _pkg from "bs58";
const { decode } = _pkg;
config();
const publicKey = atob(process.env.PUBLIC_KEY);
const privateKey = atob(process.env.PRIVATE_KEY);
const signData = (payload) => {
  const token = jwt.sign(payload, privateKey, {
    algorithm: "RS256"
  });
  return token;
};
const main = async () => {
  const client = await new MongoClient(process.env.MONGODB_URL).connect();
  console.info("MONGODB CONNECTED");
  const usersCollection = client.db(process.env.MONGODB_NAME).collection("users");
  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS, Number(process.env.CCD_PORT), credentials.createSsl());
  await startServer(Number(process.env.PORT), usersCollection, concordiumClient);
};
async function startServer(port, usersCollection, concordiumClient) {
  const app = fastify();
  app.get("/user", async (req, res) => {
    const url = new URL(req.url);
    const email = url.searchParams.get("email");
    const pass = url.searchParams.get("pass");
    if (email == null || pass == null) {
      res.status(400).send("Missing Params email or pass");
    } else {
      const userDoc = await usersCollection.findOne({ email, pass });
      if (userDoc == null) {
        res.status(404).send("Invalid username or password");
      } else {
        res.header("Content-Type", "application/json").send(JSON.stringify(userDoc));
      }
    }
  });
  app.put("/signin", async (req, res) => {
    const body = req.body;
    const email = body.email;
    const pass = body.pass;
    const address = body.address;
    const signature = body.signature;
    const changePass = body.changePass ?? false;
    if (email && pass && address && signature) {
      const message = JSON.stringify({ address, email, pass });
      const accountAddress = getAccountAddressFromBase58(address);
      if (await verifySignature(message, accountAddress, signature, concordiumClient)) {
        const userDoc = await usersCollection.findOne({ address });
        if (changePass) {
          if (userDoc) {
            await usersCollection.updateOne({ _id: userDoc._id }, {
              $set: {
                pass
              }
            });
          } else {
            const result2 = await usersCollection.insertOne({ address, email, pass });
            console.log(`INSERTED USER ${result2.insertedId}`);
          }
        } else {
          if (userDoc == null) {
            const result2 = await usersCollection.insertOne({ address, email, pass });
            console.log(`INSERTED USER ${result2.insertedId}`);
          }
        }
        res.send("success");
      }
    } else {
      res.status(400).send("Missing Parameters");
    }
  });
  const result = await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server ${result}`);
}
async function verifySignature(message, address, signature, concordiumClient) {
  const accountAccessStrucutre = await getAccountAccessStructure(address, concordiumClient);
  return verifyMessageSignature(accountAccessStrucutre, address, Buffer.from(message, "utf8"), { 0: { 0: signature } });
}
async function getAccountAccessStructure(address, concordiumClient) {
  const accountInfo = await concordiumClient.getAccountInfo(address);
  const keys = /* @__PURE__ */ new Map();
  const creds = recordToMap(accountInfo.accountCredentials);
  for (const [k, v] of creds) {
    keys.set(k, v.value.contents.credentialPublicKeys);
  }
  const threshold = accountInfo.accountThreshold;
  const accountAccessStructure = {
    threshold,
    keys
  };
  return accountAccessStructure;
}
function getAccountAddressFromBase58(address) {
  return AccountAddress.fromBytes(Buffer.from(decode(address).subarray(1, 33)));
}
function verifyMessageSignature(accountAccessStructure, signer, message, signature) {
  const hash = crypto.createHash("sha256");
  hash.update(signer.decodedAddress);
  hash.update(new Uint8Array(8));
  hash.update(message);
  const finalHash = hash.digest();
  const sigs = recordToMap(signature);
  if (accountAccessStructure.threshold > sigs.size) {
    return false;
  }
  for (const [ci, credSigs] of sigs) {
    const credSigsMap = recordToMap(credSigs);
    const credKeys = accountAccessStructure.keys.get(ci);
    if (credKeys === void 0) {
      return false;
    }
    if (credKeys.threshold > credSigsMap.size) {
      return false;
    }
    for (const [ki, sig] of credSigsMap) {
      if (credKeys.keys.hasOwnProperty(ki)) {
        const pk = credKeys.keys[ki];
        const result = tweetnacl.sign.detached.verify(finalHash, Buffer.from(sig, "hex"), Buffer.from(pk.verifyKey, "hex"));
        if (!result) {
          return false;
        }
      } else {
        return false;
      }
    }
  }
  return true;
}
function recordToMap(record) {
  const map = /* @__PURE__ */ new Map();
  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      map.set(key, record[key]);
    }
  }
  return map;
}
async function getContractViewInfo(index, address, concordiumClient) {
  const info = await concordiumClient.getInstanceInfo({ index, subindex: BigInt(0) });
  const prefix = "init_";
  console.log({ info });
  if (info) {
    if (!info.name.startsWith(prefix)) {
      throw new Error(`name "${info.name}" doesn't start with "init_"`);
    }
    const method = `${info.name.substring(prefix.length)}.view`;
    const result = await concordiumClient.invokeContract({ contract: { index, subindex: BigInt(0) }, method });
    return result;
  }
  throw new Error("Something went wrong");
}
const test = async () => {
  const address = "3sHi2FD6vdHRe8UAwEuiPMvAZBYpHKZgiNSfDJ8GRL4ygTPno5";
  const signature = "88ddc1b0926c7e8c3993926361a20ce1325591e77cbd0fb262d39f16d162cc16f77ee960ad791b06b54f9fab41042a1fc0ec74b979b76b3d83309041c849b407";
  const message = "hello";
  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS, Number(process.env.CCD_PORT), credentials.createSsl());
  const accountAddress = getAccountAddressFromBase58(address);
  const result = await verifySignature(message, accountAddress, signature, concordiumClient);
  console.log(result);
  console.log(await getContractViewInfo(BigInt(81), accountAddress, concordiumClient));
  console.log(await getContractViewInfo(BigInt(2059), accountAddress, concordiumClient));
};
test();
