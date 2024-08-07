import { task, types } from "hardhat/config";
import { getSigner } from "../utils/account";
import { Network, isMainNetwork } from "../utils/network";

interface TaskParams {
    bulletLastPresale: string;
    bulletLastToken: string;
    treasury: string;
    startTime: number;
    roundDuration: number;
    roundManager: string;
}

task("initialize:bullet-last-presale")
    .setDescription("Initialize the BulletLastPresale contract")
    .addParam<string>(
        "bulletLastPresale",
        "BulletLastPresale contract address",
        undefined,
        types.string
    )
    .addParam<string>(
        "bulletLastToken",
        "BulletLastToken contract address",
        undefined,
        types.string
    )
    .addParam<string>("treasury", "Treasury address", undefined, types.string)
    .addParam<number>("startTime", "Presale initial start time", undefined, types.int)
    .addParam<number>("roundDuration", "Round duration (in seconds)", undefined, types.int)
    .addParam<string>("roundManager", "Round manager address", undefined, types.string)
    .setAction(
        async (
            {
                bulletLastPresale: bulletLastPresaleAddress,
                bulletLastToken: bulletLastTokenAddress,
                treasury: treasuryAddress,
                startTime,
                roundDuration,
                roundManager: roundManagerAddress,
            }: TaskParams,
            { ethers, network }
        ) => {
            if (!ethers.isAddress(bulletLastPresaleAddress)) {
                throw new Error("Invalid BulletLastPresale address");
            }
            if (!ethers.isAddress(bulletLastTokenAddress)) {
                throw new Error("Invalid BulletLastToken address");
            }
            if (!ethers.isAddress(treasuryAddress)) {
                throw new Error("Invalid treasury address");
            }
            if (!ethers.isAddress(roundManagerAddress)) {
                throw new Error("Invalid round manager address");
            }

            const now = Math.floor(Date.now() / 1000);
            if (startTime === 0) {
                startTime = now + 60;
            }
            if (startTime < now) {
                throw new Error("Start time in past");
            }

            if (roundDuration === 0) {
                throw new Error("Zero round duration");
            }

            const networkName = network.name as Network;
            console.log(`Network name: ${networkName}`);

            const deployer = await getSigner(ethers, network.provider, network.config.from);
            const bulletLastPresale = await ethers.getContractAt(
                "BulletLastPresale",
                bulletLastPresaleAddress,
                deployer
            );
            const bulletLastToken = await ethers.getContractAt(
                "BulletLastTokenMock",
                bulletLastTokenAddress,
                deployer
            );

            if (!isMainNetwork(networkName)) {
                const approvedAmount = ethers.parseUnits("500000000", 18);

                const tx = await bulletLastToken.approve(bulletLastPresaleAddress, approvedAmount);
                await tx.wait(1);
                console.log(
                    `Approved amount set to ${ethers.formatUnits(approvedAmount, 18)} for ${bulletLastPresaleAddress}. Tx: ${tx.hash}`
                );
            }

            const allocatedAmount: bigint = await bulletLastToken.allowance(
                treasuryAddress,
                bulletLastPresaleAddress
            );
            if (allocatedAmount === 0n) {
                throw new Error("Zero sale token allocated amount");
            }

            const tx = await bulletLastPresale.setAllocatedAmount(allocatedAmount);
            await tx.wait(1);
            console.log(
                `Allocated amount set to ${ethers.formatUnits(allocatedAmount, 18)}. Tx: ${tx.hash}`
            );

            const roundMangerRole = await bulletLastPresale.ROUND_MANAGER_ROLE();
            await bulletLastPresale.grantRole(roundMangerRole, roundManagerAddress);
            console.log(`Round manager role set for ${roundManagerAddress}`);

            let price = 200;
            for (let i = 1; i <= 11; i++) {
                const endTime = startTime + roundDuration;
                const tx = await bulletLastPresale.createRound(i, startTime, endTime, price);
                await tx.wait(1);
                console.log(
                    `Round ${i} created: ${new Date(startTime * 1000).toUTCString()} - ${new Date(endTime * 1000).toUTCString()} at $${price / 10_000}. Tx: ${tx.hash}`
                );

                startTime = endTime + 1;
                price += 10;
            }
        }
    );
