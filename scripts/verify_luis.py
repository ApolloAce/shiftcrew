import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

queries = [
    ("Luis user record", "SELECT id, firstName, surname, branchId FROM users WHERE email = 'luis@shiftmate.com'"),
    ("Today schedule assignments (full)", "SELECT assignments FROM schedules WHERE scheduleFor = '2026-02-26' ORDER BY updatedAt DESC LIMIT 1"),
    ("Today branchAssignments (full)", "SELECT branchAssignments FROM schedules WHERE scheduleFor = '2026-02-26' ORDER BY updatedAt DESC LIMIT 1"),
    ("How many schedules for today", "SELECT COUNT(*) as cnt FROM schedules WHERE scheduleFor = '2026-02-26'"),
    ("All today schedules IDs", "SELECT id, date, scheduleFor, updatedAt FROM schedules WHERE scheduleFor = '2026-02-26' OR date = '2026-02-26' ORDER BY updatedAt DESC"),
]

for label, sql in queries:
    cmd = f'mysql -u root shiftcrew -e "{sql};"'
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace").strip()
    print(f"\n=== {label} ===")
    print(out.strip())
    if err:
        print("ERR:", err)

ssh.close()
print("\nDone")
