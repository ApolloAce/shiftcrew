import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

LUIS_ID = "f44f0554-ebb2-4f95-9963-6a26ff0c61e6"

# Check today's assignments for Luis
cmd = 'mysql -u root shiftcrew -N -e "SELECT assignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
raw = stdout.read().decode(errors="replace").strip()

try:
    assignments = json.loads(raw)
    for a in assignments:
        if a.get("employeeId") == LUIS_ID:
            print(f"Luis assignment: branchId={a.get('branchId')}, branchName={a.get('branchName')}")
            break
    else:
        print("Luis not found in today's assignments!")
except Exception as e:
    print(f"Parse error: {e}")
    print("Raw:", raw[:500])

# Check branchAssignments too
cmd2 = 'mysql -u root shiftcrew -N -e "SELECT branchAssignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"'
stdin, stdout, stderr = ssh.exec_command(cmd2, timeout=15)
raw2 = stdout.read().decode(errors="replace").strip()

try:
    ba = json.loads(raw2)
    for bg in ba:
        for e in bg.get("employees", []):
            if e.get("employeeId") == LUIS_ID:
                print(f"Luis in branchAssignments: branchId={bg.get('branchId')}, branchName={bg.get('branchName')}")
                break
except Exception as e2:
    print(f"Parse error: {e2}")

# Check user record
cmd3 = f'mysql -u root shiftcrew -N -e "SELECT b.branchName FROM users u JOIN branches b ON u.branchId = b.id WHERE u.id = \'{LUIS_ID}\';"'
stdin, stdout, stderr = ssh.exec_command(cmd3, timeout=15)
print(f"User branch: {stdout.read().decode(errors='replace').strip()}")

ssh.close()
print("Done")
