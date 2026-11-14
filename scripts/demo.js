// scripts/demo.js
const { ethers } = require("hardhat");

async function step(title, fn) {
    console.log(`\n▶ ${title}`);
    try {
        const r = await fn();
        console.log("  ✔ SUCCESS");
        return r;
    } catch (e) {
        console.log("  ✖ REJECTED (Expected/Handled):", e.shortMessage || e.message);
    }
}

async function main() {
    console.log("=== LENDLINK DEMO SCRIPT START ===");

    // 1. Получаем тестовые аккаунты из Hardhat
    const [admin, gateway, lender1, lender2, auditor, borrower] = await ethers.getSigners();
    const samplePseudonym = ethers.id("IIN_123456789012");

    console.log("Deploying LendLinkCore contract...");
    const LendLinkCore = await ethers.getContractFactory("LendLinkCore");
    const lendLink = await LendLinkCore.deploy(admin.address, gateway.address);
    await lendLink.waitForDeployment();
    
    const contractAddress = await lendLink.getAddress();
    console.log(`Contract deployed at: ${contractAddress}`);

    const LENDER_ROLE = ethers.id("LENDER_ROLE");
    const AUDITOR_ROLE = ethers.id("AUDITOR_ROLE");

    // Регистрация ролей администратором
    await step("2. Admin registers licensed lenders and auditor", async () => {
        await (await lendLink.connect(admin).grantRole(LENDER_ROLE, lender1.address)).wait();
        await (await lendLink.connect(admin).grantRole(LENDER_ROLE, lender2.address)).wait();
        await (await lendLink.connect(admin).grantRole(AUDITOR_ROLE, auditor.address)).wait();
    });

    // Выдача согласия заемщиком через шлюз
    await step("3. Gateway grants consent for Lender 1 (TTL: 3600s)", async () => {
        await (await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600)).wait();
    });

    // Запись кредита МФО (Lender 1)
    await step("4. Lender 1 records an active loan (Band 2: 150k-500k KZT)", async () => {
        await (await lendLink.connect(lender1).recordLoan(samplePseudonym, 2)).wait();
    });

    // Проверка кредитного рейтинга (O(1)-агрегаты)
    await step("5. Lender 1 checks borrower credit summary (Consent active)", async () => {
        const summary = await lendLink.connect(lender1).checkCreditSummary.staticCall(samplePseudonym);
        console.log(`   -> Active Loans: ${summary[0]}, Debt Score: ${summary[1]}, Disputed: ${summary[2]}`);
    });

    // Отзыв согласия
    await step("6. Gateway revokes consent for Lender 1", async () => {
        await (await lendLink.connect(gateway).revokeConsent(samplePseudonym, lender1.address)).wait();
    });

    // Попытка проверить кредит после отзыва согласия (должна завершиться ошибкой)
    await step("7. Lender 1 checks credit summary again (Must be rejected due to missing consent)", async () => {
        await lendLink.connect(lender1).checkCreditSummary(samplePseudonym);
    });

    // Снова даем согласие для теста спора
    await lendLink.connect(gateway).grantConsent(samplePseudonym, lender1.address, 3600);

    // Открытие спора аудитором
    await step("8. Auditor flags a dispute on the active loan", async () => {
        await (await lendLink.connect(auditor).openDispute(samplePseudonym, 0)).wait();
    });

    // Аварийная остановка системы администратором
    await step("9. Admin pauses the contract (Emergency stop)", async () => {
        await (await lendLink.connect(admin).pause()).wait();
    });

    // Попытка записать кредит при остановленном контракте (должна получить реверт)
    await step("10. Lender 1 tries to record a loan while paused (Must be blocked)", async () => {
        await lendLink.connect(lender1).recordLoan(samplePseudonym, 1);
    });

    console.log("\n=== LENDLINK DEMO SCRIPT COMPLETED SUCCESSFULLY ===");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});