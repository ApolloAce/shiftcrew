import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

queries = [
    ("User Record", "SELECT id, firstName, surname, email, branchId FROM users WHERE email = 'luis@shiftmate.com'"),
    ("All Branches", "SELECT id, branchName FROM branches"),
    ("Today Schedules", "SELECT id, date, scheduleFor, LEFT(assignments, 3000) as ap FROM schedules WHERE scheduleFor = CURDATE() OR date = CURDATE() ORDER BY updatedAt DESC LIMIT 2"),
]

for label, sql in queries:
    cmd = 'mysql -u root shiftcrew -e "' + sql + ';"'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    print(f"\n=== {label} ===")
    if out.strip():
        print(out)
    if err.strip():
        print("ERR:", err)

ssh.close()
print("Done")
