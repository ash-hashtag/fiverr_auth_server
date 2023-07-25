import fs from "fs"
import {readFile} from "fs/promises"
import { config } from "dotenv"
import fastify from "fastify"
import { MongoClient } from "mongodb"
import jwt from "jsonwebtoken"

config()

const publicKey = fs.readFileSync("publicKey").toString('utf8')
const privateKey = fs.readFileSync("privateKey").toString('utf8')

const signData = (payload) => {
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
  })
  return token
}

const main = async () => {
  const client = await new MongoClient(process.env.MONGODB_URL).connect()
  console.info("MONGODB CONNECTED")
  const usersCollection = client.db('mygame').collection("users")

  const app = fastify()
  app.get("/key", (req, res) => {
    console.log(`GET /key FROM ${JSON.stringify(req.socket.address())}`)
    res.send(publicKey)
  })

  app.put("/signup", async (req, res) => {
    console.log(`PUT /signup FROM ${JSON.stringify(req.socket.address())}`)
    const responseBody = req.body
    const email = responseBody.email
    const pass = responseBody.pass
    const assets = responseBody.assets
    const publicAddress = responseBody.address
    console.log(responseBody)

    if (
      typeof email === "string" &&
      typeof pass === "string" &&
      typeof publicAddress === "string"
    ) {
      const address = publicAddress
      const prevDocIfExists = await usersCollection.findOne({ address, email })
      if (prevDocIfExists != null) {
        res.status(400).send("User already exists!")
      } else {
        const result = await usersCollection.insertOne({
          address,
          assets,
          pass,
          email
        })

        console.log(`NEW USER SIGNED UP ${result.insertedId} ${address} ${email}`)
        const jwk = { email, address, pass }
        const signedKey = signData(jwk)
        res.send(signedKey)
      }
    }
  })

  app.put("/signin", async (req, res) => {
    console.log(`PUT /signin FROM ${JSON.stringify(req.socket.address())}`)
    const responseBody = req.body
    const email = responseBody.email
    const pass = responseBody.pass
    const assets = responseBody.assets
    const publicAddress = responseBody.address

    console.log(responseBody)
    if (
      typeof email === "string" &&
      typeof pass === "string" &&
      typeof publicAddress === "string"
    ) {
      const address = publicAddress
      const prevDocIfExists = await usersCollection.findOne({ address })
      if (prevDocIfExists != null) {
        if (email === prevDocIfExists['email'] && pass === prevDocIfExists['pass'] && address == prevDocIfExists['address'])
          console.log(`USER SIGNED IN ${prevDocIfExists._id} ${address} ${email}`)
        const jwk = { email, address, pass }
        const signedKey = signData(jwk)

        usersCollection.updateOne({_id: prevDocIfExists._id}, { $set: {
          assets
        }, }, )

        res.send(signedKey)
      } else {
        res.status(403).send("User does not exist")
      }
    }
  })

  app.get("/", async (_req, res) => {
    res
    .header("Content-Type", "text/html")
    .send(await readFile("frontend/public/index.html"))
  })

  app.get("/index.js", async (_req, res) => {
    res
    .header("Content-Type", "text/javascript")
    .send(await readFile("frontend/public/index.js"))
  })


  app.get("/callback", async (req, res) => {
    console.log("callback ", req.url)
    res.send()
  })

  console.info(await app.listen({ port: 8321 }))
}

main()
