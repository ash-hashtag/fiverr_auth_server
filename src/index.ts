import { readFile } from "fs/promises"
import { config } from "dotenv"
import crypto from "crypto"
import fastify from "fastify"
import { Collection, MongoClient, Document } from "mongodb"
import { AccountAddress, AccountTransactionSignature, ConcordiumGRPCClient, CredentialPublicKeys, createConcordiumClient, serializeUpdateContractParameters } from "@concordium/node-sdk"
import { credentials } from "@grpc/grpc-js"
import tweetnacl from "tweetnacl"
import {toBuffer} from "@concordium/web-sdk"
import _pkg from "bs58"
const { decode } = _pkg

config()

const BALANCEOF_FUNCTION_RAW_SCHEMA = '//8CAQAAAAkAAABjaXMyX3dDQ0QBABQAAgAAAAMAAAB1cmwWAgQAAABoYXNoFQIAAAAEAAAATm9uZQIEAAAAU29tZQEBAAAAEyAAAAACAQAAAAkAAABiYWxhbmNlT2YGEAEUAAIAAAAIAAAAdG9rZW5faWQdAAcAAABhZGRyZXNzFQIAAAAHAAAAQWNjb3VudAEBAAAACwgAAABDb250cmFjdAEBAAAADBABGyUAAAAVBAAAAA4AAABJbnZhbGlkVG9rZW5JZAIRAAAASW5zdWZmaWNpZW50RnVuZHMCDAAAAFVuYXV0aG9yaXplZAIGAAAAQ3VzdG9tAQEAAAAVCQAAAAsAAABQYXJzZVBhcmFtcwIHAAAATG9nRnVsbAIMAAAATG9nTWFsZm9ybWVkAg4AAABDb250cmFjdFBhdXNlZAITAAAASW52b2tlQ29udHJhY3RFcnJvcgITAAAASW52b2tlVHJhbnNmZXJFcnJvcgIaAAAARmFpbGVkVXBncmFkZU1pc3NpbmdNb2R1bGUCHAAAAEZhaWxlZFVwZ3JhZGVNaXNzaW5nQ29udHJhY3QCJQAAAEZhaWxlZFVwZ3JhZGVVbnN1cHBvcnRlZE1vZHVsZVZlcnNpb24C';


// const publicKey = atob(process.env.PUBLIC_KEY!)
// const privateKey = atob(process.env.PRIVATE_KEY!)

// const signData = (payload: Object) => {
//   const token = jwt.sign(payload, privateKey, {
//     algorithm: 'RS256',
//   })
//   return token
// }

const main = async () => {
  const client = await new MongoClient(process.env.MONGODB_URL!).connect()
  console.info("MONGODB CONNECTED")
  const usersCollection = client.db(process.env.MONGODB_NAME!).collection("users")
  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS!, Number(process.env.CCD_PORT!), credentials.createSsl())

  await startServer(Number(process.env.PORT), usersCollection, concordiumClient)
}


async function startServer(port: number, usersCollection: Collection<Document>, concordiumClient: ConcordiumGRPCClient) {
  const app = fastify()
  app.get("/user", async (req, res) => {
    // const email = url.searchParams.get("email")
    // const pass = url.searchParams.get("pass")
    const email: string | undefined = req.query.email
    const pass: string | undefined = req.query.pass
    console.log({email, pass})
    // const contractIndex = url.searchParams.get("contractIndex")

    if (email === undefined || pass === undefined) {
      res.status(400).send("Missing Params email or pass")
    } else {
      const userDoc = await usersCollection.findOne({ email, pass })
      if (userDoc == null) {
        res.status(404).send("Invalid username or password")
      } else {
        const body  = {
          address: userDoc.address,
          nfts: []
        }
        // if (contractIndex) {
          // body.tokens = await getContractViewInfo(BigInt(contractIndex), getAccountAddressFromBase58(userDoc.address as string), concordiumClient)
        // }
        res.header("Content-Type", "application/json")
          .send(JSON.stringify(body))
      }
    }
  })

  app.put("/signin", async (req, res) => {
    const body: any = req.body
    const email: string | undefined = body.email
    const pass: string | undefined = body.pass
    const address: string | undefined = body.address
    const signature: string | undefined = body.signature

    if (email && pass && address && signature) {
      const message = JSON.stringify({ email, pass })
      const accountAddress = getAccountAddressFromBase58(address)
      if (await verifySignature(message, accountAddress, signature, concordiumClient)) {
        const userDoc = await usersCollection.findOne({ email })
        if (userDoc) {
          if (userDoc.address === address) {
            await usersCollection.updateOne({ _id: userDoc._id }, { $set: { address, email, pass } })
            res.send("success")
          } else {
            // await usersCollection.insertOne({ address, email, pass })
            res.status(403).send("An Address is already associated with that email")
          }
        } else {
          await usersCollection.insertOne({ address, email, pass })
          res.send("success")
        }
      } else {
        res.status(403).send("Invalid Signature")
      }
    } else {
      res.status(400).send("Missing Parameters")
    }
  })


  app.get("/sign", async (_req, res) => {
    res.header("Content-Type", "text/html").send(await readFile("frontend/public/index.html"))
  })
  app.get("/sign/index.js", async (_req, res) => {
    res.header("Content-Type", "text/javascript").send(await readFile("frontend/public/index.js"))
  })
  app.get("/index.js", async (_req, res) => {
    res.header("Content-Type", "text/javascript").send(await readFile("frontend/public/index.js"))
  })


  const result = await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server ${result}`)
}


async function verifySignature(message: string, address: AccountAddress, signature: AccountTransactionSignature, concordiumClient: ConcordiumGRPCClient) {
  // const accountAddress = getAccountAddressFromBase58(address)
  const accountAccessStrucutre = await getAccountAccessStructure(address, concordiumClient)

  return verifyMessageSignature(accountAccessStrucutre, address, Buffer.from(message, "utf8"), signature)
}

async function getAccountAccessStructure(address: AccountAddress, concordiumClient: ConcordiumGRPCClient) {

  const accountInfo = await concordiumClient.getAccountInfo(address)

  const keys = new Map<number, CredentialPublicKeys>()

  const creds = recordToMap(accountInfo.accountCredentials)

  for (const [k, v] of creds) {
    keys.set(k, v.value.contents.credentialPublicKeys)
  }

  const threshold = accountInfo.accountThreshold
  const accountAccessStructure: AccountAccessStructure = {
    threshold,
    keys,
  }

  return accountAccessStructure
}


function getAccountAddressFromBase58(address: string) {
  //@ts-ignore
  return AccountAddress.fromBytes(Buffer.from(decode(address).subarray(1, 33)))
}

interface AccountAccessStructure {
  threshold: number,
  keys: Map<number, CredentialPublicKeys>,
}

function verifyMessageSignature(accountAccessStructure: AccountAccessStructure, signer: AccountAddress, message: Buffer, signature: AccountTransactionSignature): boolean {

  const hash = crypto.createHash("sha256")
  hash.update(signer.decodedAddress)
  hash.update(new Uint8Array(8))
  hash.update(message)

  const finalHash = hash.digest()
  const sigs = recordToMap(signature)

  if (accountAccessStructure.threshold > sigs.size) {
    return false
  }

  for (const [ci, credSigs] of sigs) {
    const credSigsMap = recordToMap(credSigs)
    const credKeys = accountAccessStructure.keys.get(ci)
    if (credKeys === undefined) {
      return false
    }
    if (credKeys.threshold > credSigsMap.size) {
      return false
    }

    for (const [ki, sig] of credSigsMap) {
      if (credKeys.keys.hasOwnProperty(ki)) {
        const pk = credKeys.keys[ki]
        const result = tweetnacl.sign.detached.verify(finalHash, Buffer.from(sig, "hex"), Buffer.from(pk.verifyKey, "hex"))
        if (!result) {
          return false
        }
      } else {
        return false
      }
    }

  }

  return true


}

function recordToMap<T extends string | number | symbol, U>(record: Record<T, U>): Map<T, U> {
  const map = new Map<T, U>()
  for (const key in record) {
    if (record.hasOwnProperty(key)) {
      map.set(key, record[key])
    }
  }

  return map
}




async function getContractViewInfo(index: bigint, address: AccountAddress, concordiumClient: ConcordiumGRPCClient) {
  const info = await concordiumClient.getInstanceInfo({ index, subindex: BigInt(0) })
  const prefix = 'init_'
  if (info) {
    if (!info.name.startsWith(prefix)) {
      throw new Error(`name "${info.name}" doesn't start with "init_"`);
    }

    const contractName = info.name.substring(prefix.length)
    const account = address.address
    const rawSchema = Buffer.from(BALANCEOF_FUNCTION_RAW_SCHEMA, "base64")

    console.log({ rawSchema })

    const param = serializeUpdateContractParameters(
        contractName,
        'balanceOf',
        [
            {
                address: {
                    Account: [account],
                },
                token_id: '',
            },
        ],
        rawSchema,
    );
    
    const method = `${contractName}.view`
    const result = await concordiumClient.invokeContract({ contract: { index, subindex: BigInt(0), }, method, parameter: param })
    console.log(JSON.stringify(result, (_k, v) => typeof v === "bigint" ? v.toString() : v, " "))
    return result
    }
  throw new Error("Something went wrong")
}


const test = async () => {
  const address = "3sHi2FD6vdHRe8UAwEuiPMvAZBYpHKZgiNSfDJ8GRL4ygTPno5"
  const signature = "88ddc1b0926c7e8c3993926361a20ce1325591e77cbd0fb262d39f16d162cc16f77ee960ad791b06b54f9fab41042a1fc0ec74b979b76b3d83309041c849b407"
  const message = "hello"
  const address2 = "4mZTZwDaKdXUs4FmwWo1j7zJxjjnNyQSrD1LkZ2TLmThHdZiYi"

  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS!, Number(process.env.CCD_PORT!), credentials.createSsl())
  const accountAddress = getAccountAddressFromBase58(address)
  const accountAddress2 = getAccountAddressFromBase58(address2)
  // const result = await verifySignature(message, accountAddress, signature, concordiumClient)
  // console.log(result)
  console.log(await concordiumClient.getInstanceInfo({ index: BigInt(81), subindex: BigInt(0) }))
  console.log(await concordiumClient.getInstanceInfo({ index: BigInt(2059), subindex: BigInt(0) }))

  console.log(await getContractViewInfo(BigInt(81), accountAddress2, concordiumClient))
  console.log(await getContractViewInfo(BigInt(81), accountAddress, concordiumClient))
}

// test()
main()
