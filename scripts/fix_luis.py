import paramiko, sys
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

# Fix Luis's branchId to match today's schedule (Carmona branch)
LUIS_ID = "f44f0554-ebb2-4f95-9963-6a26ff0c61e6"
CARMONA_ID = "f9833e41-4d09-433e-b709-3c664f7027d5"

update_sql = f"UPDATE users SET branchId = '{CARMONA_ID}' WHERE id = '{LUIS_ID}'"
cmd = f'mysql -u root shiftcrew -e "{update_sql};"'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
out = stdout.read().decode(errors="replace")
err = stderr.read().decode(errors="replace")
print("Update result:", out or "(ok)")
if err.strip():
    print("ERR:", err)

# Verify
verify_sql = f"SELECT id, firstName, surname, email, branchId FROM users WHERE id = '{LUIS_ID}'"
cmd2 = f'mysql -u root shiftcrew -e "{verify_sql};"'
stdin, stdout, stderr = ssh.exec_command(cmd2, timeout=15)
out2 = stdout.read().decode(errors="replace")
print("\n=== Verified ===")
print(out2)

# Also show the branch name for the new branchId
verify2 = f"SELECT id, branchName FROM branches WHERE id = '{CARMONA_ID}'"
cmd3 = f'mysql -u root shiftcrew -e "{verify2};"'
stdin, stdout, stderr = ssh.exec_command(cmd3, timeout=15)
out3 = stdout.read().decode(errors="replace")
print("=== Branch ===")
print(out3)

ssh.close()
print("Done")
