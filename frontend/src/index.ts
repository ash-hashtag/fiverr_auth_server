
import { TESTNET, BrowserWalletConnector, Network, WalletConnectConnection, WalletConnectConnector, WalletConnection, WalletConnectionDelegate, withJsonRpcClient } from "@concordium/wallet-connectors"
import { AccountAddress, JsonRpcClient, HttpProvider, ConcordiumGRPCClient, createConcordiumClient } from "@concordium/web-sdk"

console.log("MAIN")
const API_BASE_URL = ""

const consoleElement = document.getElementById("console")!
document.querySelector("#connect-btn")!.addEventListener("click", connectToWallet)
console.info(TESTNET)

class MyDelegate implements WalletConnectionDelegate {
  accounts = new Map<WalletConnection, string | undefined>();
  chains = new Map<WalletConnection, string | undefined>();

  onChainChanged(connection: WalletConnection, genesisHash: string): void {
    this.chains.set(connection, genesisHash)
    console.log(`ONCHAINCHANGED ${connection} ${genesisHash}`)
  }
  onAccountChanged(connection: WalletConnection, address: string | undefined): void {
    this.accounts.set(connection, address);
    console.log(`ONACCOUNTCHANGED ${connection} ${address}`)
  }
  onConnected(connection: WalletConnection, address: string | undefined): void {
    this.onAccountChanged(connection, address)
    console.log(`ONCONNECTED ${connection} ${address}`)

  }
  onDisconnected(connection: WalletConnection): void {
    this.accounts.delete(connection)
    this.chains.delete(connection)
    console.log(`ONDISCONNECTED ${connection}`)
  }

}

const delegate = new MyDelegate()
async function connectToWallet()  {

  const browserWalletConnector = await BrowserWalletConnector.create(delegate)

  await browserWalletConnector.connect()

  console.log(await browserWalletConnector.getConnectedAccount())

  signIn()
}

const jsonStringify = (o: Object) => {
 return JSON.stringify(o, (_key, value) => typeof value === "bigint" ? value.toString(): value )
}



const getSmartContractInfo = async (index: bigint, addr: string) => {
  const rpc = new JsonRpcClient(new HttpProvider(TESTNET.jsonRpcUrl))
  const accountInfo = await rpc.getAccountInfo(addr)
  console.info("ACCOUNT INFO")
  console.log(accountInfo)
  console.info("ACCOUNT INFO")

  const info = await rpc.getInstanceInfo({ index, subindex: BigInt(0) })

  const prefix = 'init_';
  if (info) {
    if (!info.name.startsWith(prefix)) {
      throw new Error(`name "${info.name}" doesn't start with "init_"`);
    }
    const data = { ...info }
    // const method = `${info.name.substring(prefix.length)}.view`
    // const result = await rpc.invokeContract({ contract: { index, subindex: BigInt(0) }, method })
    // data['view'] = result
    console.info(data)
    return data
  } else {
    throw "Invalid Contract"
  }

}

async function signIn  ()  {
  console.log(`ACCOUNTS ${delegate.accounts.size}`)
  for (const [key, value] of delegate.accounts) {
    let message = ""
    const addr = value
    const conn = key

    if (addr != undefined) {

      const assets: any[] = []
      assets.push(await getSmartContractInfo(BigInt(81), addr)) // Piggy Bank
      // assets.push(await getSmartContractInfo(BigInt(81), addr))
      const urlParams = new URLSearchParams(window.location.href)
      const email = urlParams.get("email")
      const pass = urlParams.get("pass")
      const signIn = urlParams.get("signin")
      const callbackUrl = urlParams.get("callback")
      const address = addr

      console.log( { email, pass, signIn, callbackUrl, address })

      message = jsonStringify({ assets, email, pass, address })

      console.log(`signing ${message} with ${addr}`)

      const signedMessage = await conn.signMessage(addr, {
        type: "StringMessage",
        value: message
      })

      console.log(`signed ${message} to ${JSON.stringify(signedMessage)}`)
      console.info(signedMessage)
      const body = {
        email, pass, assets, address, signedMessage
      }
      if (signIn === "true") {
        const response = await fetch(`${API_BASE_URL}/signin`, {
          method: "PUT", headers: {
            "content-type": "application/json"
          },
          body: jsonStringify(body)
        })
        if (response.status === 200) {
          const uri = new URL(callbackUrl!)
          const params = new URLSearchParams(callbackUrl!)
          params.append("address", address)
          params.append("email", email!)
          params.append("token", await response.text())
          uri.search = params.toString()
          console.log(`Launching ${uri}`)
          window.location.href = uri.toString()
        }

      } else {
        const response = await fetch(`${API_BASE_URL}/signup`, {
          method: "PUT", headers: {
            "content-type": "application/json"
          },
          body: jsonStringify(body)
        })

        const uri = new URL(callbackUrl!)
        const params = new URLSearchParams(callbackUrl!)
        if (response.status === 200) {
          params.append("address", address)
          params.append("email", email!)
          params.append("token", await response.text())
          uri.search = params.toString()
          console.log(`Launching ${uri}`)
          window.location.href = uri.toString()
        } else {
          params.append("error", await response.text())
          uri.search = params.toString()
          window.localStorage.href = uri.toString()
        }
      }
      break
    }
    else {
      console.error(`Connected Account Address is null`)
    }

  }
}
// function base64ToArrayBuffer(base64: string) {
//   var binaryString = atob(base64);
//   var bytes = new Uint8Array(binaryString.length);
//   for (var i = 0; i < binaryString.length; i++) {
//     bytes[i] = binaryString.charCodeAt(i);
//   }
//   return bytes.buffer;
// }
