import paramiko, json

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

commands = [
    "mysql -u root shiftcrew -e \"SHOW COLUMNS FROM users LIKE 'type';\"",
    "mysql -u root shiftcrew -e \"SHOW COLUMNS FROM users LIKE 'nickname';\"",
    "mysql -u root shiftcrew -e \"SELECT id, firstName, surname, type, nickname FROM users WHERE role='employee' LIMIT 3;\"",
]

for cmd in commands:
    print(f"\\n=== {cmd} ===")
    i, o, e = ssh.exec_command(cmd, timeout=60)
    print(o.read().decode(errors='ignore'))
    err = e.read().decode(errors='ignore')
    if err.strip():
        print('ERR:', err)

# Test a real API update against localhost with one employee id
cmd = "bash -lc 'EMP_ID=$(mysql -N -u root shiftcrew -e \"SELECT id FROM users WHERE role=\\\"employee\\\" LIMIT 1\"); curl -sS -X PUT http://127.0.0.1:3000/api/employees -H \"Content-Type: application/json\" -d \"{\\\"id\\\":\\\"$EMP_ID\\\",\\\"type\\\":\\\"full-time\\\",\\\"firstName\\\":\\\"Test\\\",\\\"surname\\\":\\\"User\\\",\\\"nickname\\\":\\\"TU\\\"}\"; echo'"
print(f"\\n=== API PUT test ===")
i, o, e = ssh.exec_command(cmd, timeout=120)
print(o.read().decode(errors='ignore'))
err = e.read().decode(errors='ignore')
if err.strip():
    print('ERR:', err)

# Show pm2 error tail for API errors
print("\\n=== pm2 error tail ===")
i, o, e = ssh.exec_command("pm2 logs shiftcrew --lines 80 --nostream", timeout=120)
print(o.read().decode(errors='ignore'))
err = e.read().decode(errors='ignore')
if err.strip():
    print('ERR:', err)

ssh.close()
