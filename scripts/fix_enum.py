import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = """mysql -u root -p'@Emorej02e' shiftcrew -e "ALTER TABLE daily_attendance MODIFY COLUMN status ENUM('present','absent','undertime') NOT NULL DEFAULT 'present';" 2>&1"""
i, o, e = c.exec_command(cmd, timeout=30)
print(o.read().decode().strip())
print(e.read().decode().strip())

# Verify
i, o, e = c.exec_command("""mysql -u root -p'@Emorej02e' shiftcrew -e "SHOW COLUMNS FROM daily_attendance LIKE 'status';" 2>&1""", timeout=15)
print(o.read().decode().strip())

c.close()
print("Done")
