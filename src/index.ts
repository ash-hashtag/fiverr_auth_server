import { readFile } from "fs/promises"
import { config } from "dotenv"
import crypto from "crypto"
import fastify from "fastify"
import { Collection, MongoClient, Document } from "mongodb"
import jwt from "jsonwebtoken"
import { AccountAddress, AccountTransactionSignature, ConcordiumGRPCClient, CredentialPublicKeys, createConcordiumClient } from "@concordium/node-sdk"
import { credentials } from "@grpc/grpc-js"
import tweetnacl from "tweetnacl"
import _pkg from "bs58"
const { decode } = _pkg

config()

const publicKey = atob(process.env.PUBLIC_KEY!)
const privateKey = atob(process.env.PRIVATE_KEY!)

const signData = (payload: Object) => {
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
  })
  return token
}

const main = async () => {
  const client = await new MongoClient(process.env.MONGODB_URL!).connect()
  console.info("MONGODB CONNECTED")
  const usersCollection = client.db(process.env.MONGODB_NAME!).collection("users")
  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS!, Number(process.env.CCD_PORT!), credentials.createSsl())

  await startServer(Number(process.env.PORT), usersCollection, concordiumClient)

  // const app = fastify()
  // app.get("/key", (req, res) => {
  //   console.log(`GET /key FROM ${JSON.stringify(req.socket.address())}`)
  //   res.send(publicKey)
  // })

  // app.put("/signup", async (req, res) => {
  //   console.log(`PUT /signup FROM ${JSON.stringify(req.socket.address())}`)
  //   const responseBody = req.body
  //   const email = responseBody.email
  //   const pass = responseBody.pass
  //   const assets = responseBody.assets
  //   const publicAddress = responseBody.address
  //   console.log(responseBody)

  //   if (
  //     typeof email === "string" &&
  //     typeof pass === "string" &&
  //     typeof publicAddress === "string"
  //   ) {
  //     const address = publicAddress
  //     const prevDocIfExists = await usersCollection.findOne({ address, email })
  //     if (prevDocIfExists != null) {
  //       if (email === prevDocIfExists['email'] && pass === prevDocIfExists['pass'] && address == prevDocIfExists['address']) {
  //         console.log(`USER SIGNED IN ${prevDocIfExists._id} ${address} ${email}`)
  //         const jwk = { email, address, pass }
  //         const signedKey = signData(jwk)

  //         usersCollection.updateOne({ _id: prevDocIfExists._id }, {
  //           $set: {
  //             assets
  //           },
  //         },)

  //         res.send(signedKey)

  //       } else {
  //         res.status(403).send("Invalid email or password")
  //       }
  //     } else {
  //       const result = await usersCollection.insertOne({
  //         address,
  //         assets,
  //         pass,
  //         email
  //       })

  //       console.log(`NEW USER SIGNED UP ${result.insertedId} ${address} ${email}`)
  //       const jwk = { email, address, pass }
  //       const signedKey = signData(jwk)
  //       res.send(signedKey)
  //     }
  //   }
  // })

  // app.put("/signin", async (req, res) => {
  //   console.log(`PUT /signin FROM ${JSON.stringify(req.socket.address())}`)
  //   const responseBody = req.body
  //   const email = responseBody.email
  //   const pass = responseBody.pass
  //   const assets = responseBody.assets
  //   const publicAddress = responseBody.address

  //   console.log(responseBody)
  //   if (
  //     typeof email === "string" &&
  //     typeof pass === "string" &&
  //     typeof publicAddress === "string"
  //   ) {
  //     const address = publicAddress
  //     const prevDocIfExists = await usersCollection.findOne({ address })
  //     if (prevDocIfExists != null) {
  //       if (email === prevDocIfExists['email'] && pass === prevDocIfExists['pass'] && address == prevDocIfExists['address']) {
  //         console.log(`USER SIGNED IN ${prevDocIfExists._id} ${address} ${email}`)
  //         const jwk = { email, address, pass }
  //         const signedKey = signData(jwk)

  //         usersCollection.updateOne({ _id: prevDocIfExists._id }, {
  //           $set: {
  //             assets
  //           },
  //         },)

  //         res.send(signedKey)

  //       } else {
  //         res.status(403).send("Invalid email or password")
  //       }
  //     } else {
  //       res.status(404).send("User does not exist")
  //     }
  //   }
  // })

  // app.get("/", async (_req, res) => {
  //   res
  //     .header("Content-Type", "text/html")
  //     .send(await readFile("frontend/public/index.html"))
  // })

  // app.get("/index.js", async (_req, res) => {
  //   res
  //     .header("Content-Type", "text/javascript")
  //     .send(await readFile("frontend/public/index.js"))
  // })


  // app.get("/callback", async (req, res) => {
  //   console.log("callback ", req.url)
  //   res.send()
  // })


  // app.get("/user", async (req, res) => {
  //   const url = req.url
  //   const params = new URLSearchParams(url)
  //   const email = params.get("email")
  //   const pass = params.get("pass")
  //   if (email && pass) {
  //     const doc = await usersCollection.findOne({ email, pass })
  //     if (doc) {
  //       res.send(JSON.stringify(doc))
  //     } else {
  //       res
  //         .status(403)
  //         .send("Invalid email or password")
  //     }
  //   } else {
  //     res
  //       .status(400)
  //       .send("Missing Parameters")
  //   }
  // })

  // console.info(await app.listen({ port: 8321, host: '0.0.0.0' }))
}


async function startServer(port: number, usersCollection: Collection<Document>, concordiumClient: ConcordiumGRPCClient) {
  const app = fastify()
  app.get("/user", async (req, res) => {
    const url = new URL(req.url)
    const email = url.searchParams.get("email")
    const pass = url.searchParams.get("pass")
    const contractIndex = url.searchParams.get("contractIndex")

    if (email == null || pass == null) {
      res.status(400).send("Missing Params email or pass")
    } else {
      const userDoc = await usersCollection.findOne({ email, pass })
      if (userDoc == null) {
        res.status(404).send("Invalid username or password")
      } else {

        const body: Record<string, any> = {
          address: userDoc.address,
        }
        if (contractIndex) {
          body.tokens = await getContractViewInfo(BigInt(contractIndex), getAccountAddressFromBase58(userDoc.address as string), concordiumClient)
        }
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
    const changePass: boolean = body.changePass ?? false

    if (email && pass && address && signature) {
      const message = JSON.stringify({ address, email, pass })
      const accountAddress = getAccountAddressFromBase58(address)
      if (await verifySignature(message, accountAddress, signature, concordiumClient)) {
        const userDoc = await usersCollection.findOne({ address })
        if (userDoc) {
          if (userDoc.email === email && userDoc.pass === pass) {
            res.send("Success")
          } else {
            res.status(403).send("Invalid Email or Password")
          }
        }
        // if (changePass) {
        //   if (userDoc) {
        //     await usersCollection.updateOne({ _id: userDoc._id }, {
        //       $set: {
        //         pass,
        //       },
        //     })
        //   } else {
        //     const result = await usersCollection.insertOne({ address, email, pass })
        //     console.log(`INSERTED USER ${result.insertedId}`)
        //   }

        // } else {
        //   if (userDoc == null) {
        //     const result = await usersCollection.insertOne({ address, email, pass })
        //     console.log(`INSERTED USER ${result.insertedId}`)
        //     res.send("success")
        //   } else {
        //     if (userDoc.pass === pass) {
        //       res.send("success")
        //     } else {
        //       res.status(403).send("Invalid Password")
        //     }
        //   }
        // }
      } else {
        res.status(403).send("Invalid Signature")
      }
    } else {
      res.status(400).send("Missing Parameters")
    }
  })


  const result = await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server ${result}`)
}


async function verifySignature(message: string, address: AccountAddress, signature: string, concordiumClient: ConcordiumGRPCClient) {
  // const accountAddress = getAccountAddressFromBase58(address)
  const accountAccessStrucutre = await getAccountAccessStructure(address, concordiumClient)

  return verifyMessageSignature(accountAccessStrucutre, address, Buffer.from(message, "utf8"), { 0: { 0: signature } })
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
  console.log({ info })
  if (info) {
    if (!info.name.startsWith(prefix)) {
      throw new Error(`name "${info.name}" doesn't start with "init_"`);
    }
    // const method = `${info.name.substring(prefix.length)}.view`
    // const result = await concordiumClient.invokeContract({ contract: { index, subindex: BigInt(0), }, method })
    return info.amount
  }
  throw new Error("Something went wrong")
}


const test = async () => {
  const address = "3sHi2FD6vdHRe8UAwEuiPMvAZBYpHKZgiNSfDJ8GRL4ygTPno5"
  const signature = "88ddc1b0926c7e8c3993926361a20ce1325591e77cbd0fb262d39f16d162cc16f77ee960ad791b06b54f9fab41042a1fc0ec74b979b76b3d83309041c849b407"
  const message = "hello"

  const concordiumClient = createConcordiumClient(process.env.CCD_ADDRESS!, Number(process.env.CCD_PORT!), credentials.createSsl())
  const accountAddress = getAccountAddressFromBase58(address)
  const result = await verifySignature(message, accountAddress, signature, concordiumClient)
  console.log(result)

  console.log(await getContractViewInfo(BigInt(81), accountAddress, concordiumClient))
  console.log(await getContractViewInfo(BigInt(2059), accountAddress, concordiumClient))
}

test()
