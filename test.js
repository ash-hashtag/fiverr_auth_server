import {config} from "dotenv"

config()

const binaryString = atob(process.env.PRIVATE_KEY)
console.log(binaryString)
