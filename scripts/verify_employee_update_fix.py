import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmd = "bash -lc 'EMP_ID=$(mysql -N -u root shiftcrew -e \"SELECT id FROM users WHERE role=\\\"employee\\\" LIMIT 1\"); curl -sS -X PUT http://127.0.0.1:3000/api/employees -H \"Content-Type: application/json\" -d \"{\\\"id\\\":\\\"$EMP_ID\\\",\\\"firstName\\\":\\\"Test\\\",\\\"surname\\\":\\\"User\\\",\\\"nickname\\\":\\\"TU\\\",\\\"type\\\":\\\"part-time\\\",\\\"hireDate\\\":\\\"2026-01-01T00:00:00.000Z\\\",\\\"createdAt\\\":\\\"2026-01-01T00:00:00.000Z\\\"}\"; echo'"

print("Testing employee update API with old-style payload...")
i, o, e = ssh.exec_command(cmd, timeout=120)
print(o.read().decode(errors='ignore'))
err = e.read().decode(errors='ignore')
if err.strip():
    print('ERR:', err)

print("\nRecent API errors (should not show new hireDate SQL error):")
i, o, e = ssh.exec_command("pm2 logs shiftcrew --lines 20 --nostream", timeout=120)
print(o.read().decode(errors='ignore'))

ssh.close()
