
import { TESTNET, BrowserWalletConnector, Network, WalletConnectConnection, WalletConnectConnector, WalletConnection, WalletConnectionDelegate, withJsonRpcClient } from "@concordium/wallet-connectors"
import { AccountAddress, JsonRpcClient, HttpProvider, ConcordiumGRPCClient, createConcordiumClient } from "@concordium/web-sdk"

console.log("MAIN")
const API_BASE_URL = ""

const consoleElement = document.getElementById("console")!

consoleElement.innerText += "Waiting to connect Wallet...\n"
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



async function connectToWallet() {

  const browserWalletConnector = await BrowserWalletConnector.create(delegate)

  await browserWalletConnector.connect()

  console.log(await browserWalletConnector.getConnectedAccount())

  consoleElement.innerText += "Wallet Connected\n"

  signIn()
}

const jsonStringify = (o: Object) => {
  return JSON.stringify(o, (_key, value) => typeof value === "bigint" ? value.toString() : value)
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

async function signIn() {
  console.log(`ACCOUNTS ${delegate.accounts.size}`)
  for (const [key, value] of delegate.accounts) {
    let message = ""
    const addr = value
    const conn = key

    if (addr != undefined) {

      const assets: any[] = []
      assets.push(await getSmartContractInfo(BigInt(81), addr)) // Piggy Bank
      assets.push(await getSmartContractInfo(BigInt(2059), addr)) // WCCD
      // assets.push(await getSmartContractInfo(BigInt(81), addr))
      const urlParams = new URLSearchParams(window.location.href)
      const email = urlParams.get("email")
      const pass = urlParams.get("pass")
      const signIn = urlParams.get("signin")
      const callbackUrl = urlParams.get("callback")
      const signWithWallet = urlParams.get("signWithWallet")
      const address = addr

      console.log({ email, pass, signIn, callbackUrl, address })

      message = jsonStringify({ assets, email, pass, address })

      console.log(`signing ${message} with ${addr}`)


      const body: any = {
        email, pass, assets, address
      }
      if (signWithWallet === "true") {
        const signedMessage = await conn.signMessage(addr, {
          type: "StringMessage",
          value: message
        })
        console.log(`signed ${message} to ${JSON.stringify(signedMessage)}`)
        console.info(signedMessage)
        body['sign'] = signedMessage
      }
      if (signIn === "true") {
        const response = await fetch(`${API_BASE_URL}/signin`, {
          method: "PUT", headers: {
            "content-type": "application/json"
          },
          body: jsonStringify(body)
        })
        if (response.status === 200) {
          consoleElement.innerText += "Successfully Signed In. You can close this window\n"
          const token = await response.text()
          console.log(token)
          if (callbackUrl) {
            const uri = new URL(callbackUrl!)
            const params = new URLSearchParams(callbackUrl!)
            params.append("address", address)
            params.append("email", email!)
            params.append("token", token)
            uri.search = params.toString()
            console.log(`Launching ${uri}`)
            window.location.href = uri.toString()
          }
        } else {
          const body = await response.text()
          console.error(body)
          if (response.status == 404) {
            consoleElement.innerText += "User does not exist, Signing up instead\n"
            const response = await fetch(`${API_BASE_URL}/signup`, {
              method: "PUT", headers: {
                "content-type": "application/json"
              },
              body: jsonStringify(body)
            })

            if (response.status === 200) {
              consoleElement.innerText += "Successfully Signed In. You can close this window\n"
              const token = await response.text()
              console.log(token)
              if (callbackUrl) {
                const uri = new URL(callbackUrl!)
                const params = new URLSearchParams(callbackUrl!)
                params.append("address", address)
                params.append("email", email!)
                params.append("token", token)
                uri.search = params.toString()
                console.log(`Launching ${uri}`)
                window.location.href = uri.toString()
              }
            } else {
              consoleElement.innerText += "Sign up failed\n"
            }

          } else {
            consoleElement.innerText += "Sign in failed\n"
          }
        }

      } else {
        const response = await fetch(`${API_BASE_URL}/signup`, {
          method: "PUT", headers: {
            "content-type": "application/json"
          },
          body: jsonStringify(body)
        })

        if (response.status === 200) {
          consoleElement.innerText += "Successfully Signed In. You can close this window\n"
          const token = await response.text()
          console.log(token)
          if (callbackUrl) {
            const uri = new URL(callbackUrl!)
            const params = new URLSearchParams(callbackUrl!)
            params.append("address", address)
            params.append("email", email!)
            params.append("token", token)
            uri.search = params.toString()
            console.log(`Launching ${uri}`)
            window.location.href = uri.toString()
          }
        } else {
          consoleElement.innerText += "Sign in failed\n"
        }
      }
      break
    }
    else {
      console.error(`Connected Account Address is null`)
    }

  }
}

