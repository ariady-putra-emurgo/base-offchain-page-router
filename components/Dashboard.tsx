import { Accordion, AccordionItem } from "@nextui-org/accordion";
import { Button } from "@nextui-org/button";

import { Address, Data, fromText, LucidEvolution, MintingPolicy, SpendingValidator, TxSignBuilder } from "@lucid-evolution/lucid";
import { applyDoubleCborEncoding, applyParamsToScript, mintingPolicyToId, paymentCredentialOf, validatorToAddress } from "@lucid-evolution/utils";

const Script = {
  Mint: applyDoubleCborEncoding(
    "58b801010032323232323232323225333003323232323253330083370e900018051baa0011325333333010003153330093370e900018059baa0031533300d300c37540062944020020020020020020dd7180698059baa00116300c300d002300b001300b0023009001300637540022930a998022491856616c696461746f722072657475726e65642066616c73650013656153300249010f5f72656465656d65723a20566f696400165734ae7155ceaab9e5573eae855d12ba41"
  ),

  Spend: applyDoubleCborEncoding(
    "5903cb010100323232323232323232232253330053232323232533300a3370e900118061baa001132323253333330140051533300d3370e900018079baa005153330113010375400a264a6601e66e59241134578747261205369676e61746f726965733a200037326664646464646002002444a6664666603a00626464646464646601800400266e292201012800002533301a337100069007099b80483c80400c54ccc068cdc4001a410004266e00cdc0241002800690068b299980e800899b8a4881035b5d2900005133714911035b5f2000333300800133714911025d290000522333009009002300600122333009009002001375860360046eb4c064004c8cdd81ba83019001374e60340026ea800c4c94ccc06c0044cdc52441027b7d00003133714911037b5f200032323300100100322533301e00110031533301e3020001132333009009301d001337149101023a2000333009009301e001004301f001132333009009301d001337149101023a2000333009009301e0013006330030033021002301f0013371491102207d000033756006264a666036002266e29221025b5d00003133714911035b5f2000333300600133714911015d000032233300700700230040012233300700700200137580066e292201022c2000133005375a0040022646466e2922010268270000132333001001337006e3400920013371491101270000322253330193371000490000800899191919980300319b8000548004cdc599b80002533301c33710004900a0a40c02903719b8b33700002a66603866e2000520141481805206e0043370c004901019b8300148080cdc70020011bae0022222323300100100522533301b00110051533301b301d001133003301c001005133004301c00133002002301d0012232330010010032253330143370e0029000099b8a488101300000315333014337100029000099b8a489012d003300200233702900000089980299b8400148050cdc599b803370a002900a240c00066002002444a66602266e2400920001001133300300333708004900a19b8b3370066e14009201448180004dd3800a45001323300100100222533301400114a0264a66602266e3cdd7180b0010070a511330030030013016001375860246026602660266026602660266026602660206ea801c030030030030030030c044c048008c040004c034dd50008b1807180780118068009806801180580098041baa001149854cc01924011856616c696461746f722072657475726e65642066616c73650013656375c0022a660049210f5f72656465656d65723a20566f696400165734ae7155ceaab9e5573eae855d12ba41"
  ),
};

export default function Dashboard(props: {
  lucid: LucidEvolution;
  address: Address;
  setActionResult: (result: string) => void;
  onError: (error: any) => void;
}) {
  const { lucid, address, setActionResult, onError } = props;

  async function submitTx(tx: TxSignBuilder) {
    const txSigned = await tx.sign.withWallet().complete();
    const txHash = await txSigned.submit();

    return txHash;
  }

  type Action = () => Promise<void>;
  type ActionGroup = Record<string, Action>;

  const actions: Record<string, ActionGroup> = {
    Minting: {
      mint: async () => {
        try {
          const mintingValidator: MintingPolicy = { type: "PlutusV3", script: Script.Mint };

          const policyID = mintingPolicyToId(mintingValidator);
          const assetName = "Always True Token";

          const mintedAssets = { [`${policyID}${fromText(assetName)}`]: 1_000n };
          const redeemer = Data.void();

          const tx = await lucid
            .newTx()
            .mintAssets(mintedAssets, redeemer)
            .attach.MintingPolicy(mintingValidator)
            .attachMetadata(
              721,
              // https://github.com/cardano-foundation/CIPs/tree/master/CIP-0025#version-1
              {
                [policyID]: {
                  [assetName]: {
                    name: assetName,
                    image: "https://avatars.githubusercontent.com/u/1",
                  },
                },
              }
            )
            .complete();

          submitTx(tx).then(setActionResult).catch(onError);
        } catch (error) {
          onError(error);
        }
      },

      burn: async () => {
        try {
          const mintingValidator: MintingPolicy = { type: "PlutusV3", script: Script.Mint };

          const policyID = mintingPolicyToId(mintingValidator);
          const assetName = "Always True Token";
          const assetUnit = `${policyID}${fromText(assetName)}`;
          const burnedAssets = { [assetUnit]: -1_000n };
          const redeemer = Data.void();

          const utxos = await lucid.utxosAtWithUnit(address, assetUnit);

          const tx = await lucid.newTx().collectFrom(utxos).mintAssets(burnedAssets, redeemer).attach.MintingPolicy(mintingValidator).complete();

          submitTx(tx).then(setActionResult).catch(onError);
        } catch (error) {
          onError(error);
        }
      },
    },

    Spending: {
      deposit: async () => {
        try {
          const { network } = lucid.config();
          const pkh = String(paymentCredentialOf(address).hash);

          //#region Contract Address
          const spendingScript = applyParamsToScript(Script.Spend, [pkh]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };

          const contractAddress = validatorToAddress(network, spendingValidator);
          //#endregion

          //#region Deposit Assets
          const mintingValidator: MintingPolicy = { type: "PlutusV3", script: Script.Mint };

          const policyID = mintingPolicyToId(mintingValidator);
          const assetName = "Always True Token";

          const depositAssets = { [`${policyID}${fromText(assetName)}`]: 1_000n };
          //#endregion

          const datum = Data.void();

          const tx = await lucid.newTx().pay.ToContract(contractAddress, { kind: "inline", value: datum }, depositAssets).complete();

          submitTx(tx).then(setActionResult).catch(onError);
        } catch (error) {
          onError(error);
        }
      },

      withdraw: async () => {
        try {
          const { network } = lucid.config();
          const pkh = String(paymentCredentialOf(address).hash);

          //#region Contract Address
          const spendingScript = applyParamsToScript(Script.Spend, [pkh]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };

          const contractAddress = validatorToAddress(network, spendingValidator);
          //#endregion

          //#region Withdraw Assets
          const mintingValidator: MintingPolicy = { type: "PlutusV3", script: Script.Mint };

          const policyID = mintingPolicyToId(mintingValidator);
          const assetName = "Always True Token";

          const assetUnit = `${policyID}${fromText(assetName)}`;
          //#endregion

          const redeemer = Data.void();

          const utxos = await lucid.utxosAtWithUnit(contractAddress, assetUnit);

          const tx = await lucid.newTx().collectFrom(utxos, redeemer).attach.SpendingValidator(spendingValidator).addSigner(address).complete();

          submitTx(tx).then(setActionResult).catch(onError);
        } catch (error) {
          onError(error);
        }
      },
    },
  };

  return (
    <div className="flex flex-col gap-2">
      <span>{address}</span>

      <Accordion variant="splitted">
        {/* Minting */}
        <AccordionItem key="1" aria-label="Accordion 1" title="Minting">
          <div className="flex flex-wrap gap-2 mb-2">
            <Button onClick={actions.Minting.mint} className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full">
              Mint
            </Button>
            <Button onClick={actions.Minting.burn} className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full">
              Burn
            </Button>
          </div>
        </AccordionItem>

        {/* Spending */}
        <AccordionItem key="2" aria-label="Accordion 2" title="Spending">
          <div className="flex flex-wrap gap-2 mb-2">
            <Button onClick={actions.Spending.deposit} className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full">
              Deposit
            </Button>
            <Button onClick={actions.Spending.withdraw} className="bg-gradient-to-tr from-pink-500 to-yellow-500 text-white shadow-lg" radius="full">
              Withdraw
            </Button>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
