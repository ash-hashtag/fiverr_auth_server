import { BrowserWalletConnector, WalletConnection, WalletConnectionDelegate } from "@concordium/wallet-connectors"


const API_BASE_URL = ""

const addConsoleOutput = (s: string) => {
  const consoleElement = document.getElementById("console")!
  consoleElement.innerText += s + '\n'
}

addConsoleOutput("Waiting to connect Wallet...")
document.querySelector("#connect-btn")!.addEventListener("click", connectToWallet)

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

  addConsoleOutput("Wallet Connected")

  signIn()
}

const jsonStringify = (o: Object) => {
  return JSON.stringify(o, (_key, value) => typeof value === "bigint" ? value.toString() : value)
}


async function signIn() {
  console.log(`ACCOUNTS ${delegate.accounts.size}`)
  addConsoleOutput("Signing in...")
  for (const [key, value] of delegate.accounts) {
    const addr = value
    const conn = key

    if (addr != undefined) {
      const urlParams = new URL(window.location.href).searchParams
      const email = urlParams.get("email")
      const pass = urlParams.get("pass")
      const address = addr

      if (email != null && pass != null) {
        console.log({ email, pass, address })
        const body: Record<string, any> = {
          email, pass,
        }

        const message = jsonStringify(body)
        console.log(`signing ${message} with ${addr}`)
        const signature = await conn.signMessage(addr, {
          type: "StringMessage",
          value: message
        }).catch(err => { console.error(err); return null })
        if (signature == null) {
          addConsoleOutput("Wallet Signing Failed")
          return
        }

        addConsoleOutput("Wallet Signing Succeed")

        console.log(`signed ${message} to ${JSON.stringify(signature)}`)
        body['signature'] = signature
        body['address'] = address
        addConsoleOutput("Signing to the game")

        console.log(`Sending Data ${jsonStringify(body)}`)

        const response = await fetch(`${API_BASE_URL}/signin`, {
          method: 'PUT',
          body: jsonStringify(body),
          headers: new Headers({
            "Content-Type": "application/json"
          })
        })

        if (response.status == 200) {
          console.log("Successfully logged in")
          addConsoleOutput("Signed successfully to the game. You can close this window")
        } else {
          const text = await response.text()
          console.error(`Signin failed [${response.status}] ${text}`)
          addConsoleOutput("Signing failed  to the game. Reason: ${text}")
        }
      } else {
        addConsoleOutput("Missing Fields")
      }

      break
    }
    else {
      console.error(`Connected Account Address is null`)
    }

  }
}

