import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = require("../../../target/idl/greyswan.json");
  const program = new Program(idl, provider);

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const adminPubkey = new anchor.web3.PublicKey(
    "76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4"
  );

  console.log("Config PDA:", configPda.toBase58());
  console.log("Setting admin to:", adminPubkey.toBase58());

  const tx = await program.methods
    .initConfig(adminPubkey)
    .accounts({
      config: configPda,
      payer: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("Transaction signature:", tx);
  console.log("Config initialized successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});