
import { AccountTransactionSignature } from "@concordium/node-sdk"
import { TESTNET, BrowserWalletConnector, WalletConnection, WalletConnectionDelegate } from "@concordium/wallet-connectors"


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


async function signIn() {
  console.log(`ACCOUNTS ${delegate.accounts.size}`)
  for (const [key, value] of delegate.accounts) {
    let message = ""
    const addr = value
    const conn = key

    if (addr != undefined) {
      const urlParams = new URLSearchParams(window.location.href)
      const email = urlParams.get("email")
      const pass = urlParams.get("pass")
      // const callbackUrl = urlParams.get("callback")
      const address = addr

      if (email != null && pass != null) {
        console.log({ email, pass, signIn,  address })

        message = jsonStringify({ address, email, pass, })

        console.log(`signing ${message} with ${addr}`)


        const body: Record<string, string | AccountTransactionSignature> = {
         address, email, pass, 
        }
        const signature = await conn.signMessage(addr, {
          type: "StringMessage",
          value: message
        })
        console.log(`signed ${message} to ${JSON.stringify(signature)}`)
        body['signature'] = signature

        const response = await fetch(`${API_BASE_URL}/signin`, {
          method: 'PUT',
          body: jsonStringify(body),
          headers: new Headers({
            "Content-Type": "application/json"
          })
        })

        if (response.status == 200) {
          console.log("Successfully logged in")
        } else {
          console.error(`Signin failed [${response.status}] ${await response.text()}`)
        }
      }

      break
    }
    else {
      console.error(`Connected Account Address is null`)
    }

  }
}

