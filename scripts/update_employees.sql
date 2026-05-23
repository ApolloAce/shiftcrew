-- Update active employees to match the true client list (25 employees)
-- Maps by employeeCode order, updates names and emails

-- 1. John Mark Santos (2026-0001)
UPDATE users SET firstName='John Mark', surname='Santos', email='johnmark.santos@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0001';
-- 2. Maria Angelica Reyes (2026-0002)
UPDATE users SET firstName='Maria Angelica', surname='Reyes', email='mariaangelica.reyes@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0002';
-- 3. Kevin Louie Cruz (2026-0003)
UPDATE users SET firstName='Kevin Louie', surname='Cruz', email='kevinlouie.cruz@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0003';
-- 4. Jessa Mae Bautista (2026-0004)
UPDATE users SET firstName='Jessa Mae', surname='Bautista', email='jessamae.bautista@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0004';
-- 5. Michael Angelo Garcia (2026-0005)
UPDATE users SET firstName='Michael Angelo', surname='Garcia', email='michaelangelo.garcia@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0005';
-- 6. Princess Joy Mendoza (2026-0006)
UPDATE users SET firstName='Princess Joy', surname='Mendoza', email='princessjoy.mendoza@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0006';
-- 7. Christian Paul Torres (2026-0007)
UPDATE users SET firstName='Christian Paul', surname='Torres', email='christianpaul.torres@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0007';
-- 8. Mary Grace Flores (2026-0008)
UPDATE users SET firstName='Mary Grace', surname='Flores', email='marygrace.flores@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0008';
-- 9. Joshua Daniel Ramos (2026-0009)
UPDATE users SET firstName='Joshua Daniel', surname='Ramos', email='joshuadaniel.ramos@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0009';
-- 10. Kimberly Anne Navarro (2026-0010)
UPDATE users SET firstName='Kimberly Anne', surname='Navarro', email='kimberlyanne.navarro@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0010';
-- 11. John Carlo Aquino (2026-0011)
UPDATE users SET firstName='John Carlo', surname='Aquino', email='johncarlo.aquino@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0011';
-- 12. Angela Mae Castillo (2026-0012)
UPDATE users SET firstName='Angela Mae', surname='Castillo', email='angelamae.castillo@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0012';
-- 13. Mark Anthony Delgado (2026-0013)
UPDATE users SET firstName='Mark Anthony', surname='Delgado', email='markanthony.delgado@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0013';
-- 14. Rica Mae Villanueva (2026-0014)
UPDATE users SET firstName='Rica Mae', surname='Villanueva', email='ricamae.villanueva@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0014';
-- 15. Joseph Emmanuel Herrera (2026-0015)
UPDATE users SET firstName='Joseph Emmanuel', surname='Herrera', email='josephemmanuel.herrera@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0015';
-- 16. Alyssa Nicole Fernandez (2026-0016)
UPDATE users SET firstName='Alyssa Nicole', surname='Fernandez', email='alyssanicole.fernandez@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0016';
-- 17. Ryan Christopher Diaz (2026-0017)
UPDATE users SET firstName='Ryan Christopher', surname='Diaz', email='ryanchristopher.diaz@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0017';
-- 18. Christine Joy Morales (2026-0018)
UPDATE users SET firstName='Christine Joy', surname='Morales', email='christinejoy.morales@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0018';
-- 19. Patrick James Gutierrez (2026-0020)
UPDATE users SET firstName='Patrick James', surname='Gutierrez', email='patrickjames.gutierrez@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0020';
-- 20. Camille Rose Chavez (2026-0021)
UPDATE users SET firstName='Camille Rose', surname='Chavez', email='camillerose.chavez@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0021';
-- 21. Vincent Paul Dominguez (2026-0023)
UPDATE users SET firstName='Vincent Paul', surname='Dominguez', email='vincentpaul.dominguez@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0023';
-- 22. Hazel Mae Rivera (2026-0024)
UPDATE users SET firstName='Hazel Mae', surname='Rivera', email='hazelmae.rivera@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0024';
-- 23. Daniel Joseph Ortega (2026-0025)
UPDATE users SET firstName='Daniel Joseph', surname='Ortega', email='danieljoseph.ortega@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0025';
-- 24. Nicole Andrea Salazar (2026-0027)
UPDATE users SET firstName='Nicole Andrea', surname='Salazar', email='nicoleandrea.salazar@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0027';
-- 25. Carlo Miguel Espinoza (2026-0029)
UPDATE users SET firstName='Carlo Miguel', surname='Espinoza', email='carlomiguel.espinoza@shiftcrew.com', updatedAt=NOW() WHERE employeeCode='2026-0029';

-- Archive the extra 4 employees that are not in the client list
UPDATE users SET archived=1, updatedAt=NOW() WHERE employeeCode IN ('2026-0028', '2026-0030', '2026-0031', '2026-0032');
