import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

LUIS_ID = "f44f0554-ebb2-4f95-9963-6a26ff0c61e6"
BINAN_ID = "85fd9967-2a52-4f21-9aa0-9e931cce35ef"
BINAN_NAME = "Binan Branch"
CARMONA_ID = "f9833e41-4d09-433e-b709-3c664f7027d5"

# Use MySQL JSON_REPLACE to update directly without Python JSON round-trip escaping issues
# First get the index of Luis in the assignments array for today's schedule
cmd = 'mysql -u root shiftcrew -N -e "SELECT id, assignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
raw = stdout.read().decode(errors="replace").strip()
parts = raw.split("\t", 1)
sched_id = parts[0]
assignments = json.loads(parts[1])

print(f"Schedule ID: {sched_id}")
luis_idx = None
for i, a in enumerate(assignments):
    if a.get("employeeId") == LUIS_ID:
        luis_idx = i
        print(f"Luis at index {i}, current branch: {a.get('branchName')}")
        break

if luis_idx is not None:
    # Use MySQL JSON_SET to update just Luis's branchId and branchName
    update_sql = f"""UPDATE schedules SET assignments = JSON_SET(assignments, '$[{luis_idx}].branchId', '{BINAN_ID}', '$[{luis_idx}].branchName', '{BINAN_NAME}') WHERE id = '{sched_id}'"""
    cmd2 = f'mysql -u root shiftcrew -e "{update_sql};"'
    stdin, stdout, stderr = ssh.exec_command(cmd2, timeout=15)
    stdout.read()
    err = stderr.read().decode(errors="replace").strip()
    if err:
        print(f"assignments ERR: {err}")
    else:
        print("assignments UPDATED")

# Now fix branchAssignments - use SFTP to write a fix SQL file instead
cmd3 = 'mysql -u root shiftcrew -N -e "SELECT branchAssignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"'
stdin, stdout, stderr = ssh.exec_command(cmd3, timeout=15)
ba_raw = stdout.read().decode(errors="replace").strip()
ba = json.loads(ba_raw)

luis_entry = None
for bg in ba:
    emps = bg.get("employees", [])
    for e in list(emps):
        if e.get("employeeId") == LUIS_ID and bg.get("branchId") != BINAN_ID:
            luis_entry = e.copy()
            emps.remove(e)
            print(f"Removed Luis from {bg.get('branchName')} in branchAssignments")

if luis_entry:
    binan_group = next((bg for bg in ba if bg.get("branchId") == BINAN_ID), None)
    if not binan_group:
        binan_group = {"branchId": BINAN_ID, "branchName": BINAN_NAME, "employees": []}
        ba.append(binan_group)
    binan_group["employees"].append(luis_entry)
    print(f"Added Luis to {BINAN_NAME}")

    # Write the JSON to a temp file on server, then use LOAD_FILE or a SQL script
    new_ba_json = json.dumps(ba)
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/ba_fix.json", "w") as f:
        f.write(new_ba_json)
    sftp.close()
    print("Wrote /tmp/ba_fix.json")

    # Update using the file content
    update_sql = f"UPDATE schedules SET branchAssignments = LOAD_FILE('/tmp/ba_fix.json') WHERE id = '{sched_id}'"
    cmd4 = f'mysql -u root shiftcrew -e "{update_sql};"'
    stdin, stdout, stderr = ssh.exec_command(cmd4, timeout=15)
    stdout.read()
    err = stderr.read().decode(errors="replace").strip()
    if err:
        print(f"branchAssignments LOAD_FILE ERR: {err}")
        # Fallback: use a SQL file approach
        sql_content = f"UPDATE schedules SET branchAssignments = '{new_ba_json.replace(chr(39), chr(92)+chr(39))}' WHERE id = '{sched_id}';\n"
        sftp2 = ssh.open_sftp()
        with sftp2.open("/tmp/ba_fix.sql", "w") as f:
            f.write(sql_content)
        sftp2.close()
        print("Wrote /tmp/ba_fix.sql, executing...")
        cmd5 = 'mysql -u root shiftcrew < /tmp/ba_fix.sql'
        stdin, stdout, stderr = ssh.exec_command(cmd5, timeout=15)
        stdout.read()
        err2 = stderr.read().decode(errors="replace").strip()
        if err2:
            print(f"SQL file ERR: {err2}")
        else:
            print("branchAssignments UPDATED via SQL file")
    else:
        print("branchAssignments UPDATED via LOAD_FILE")

# Also fix ALL other days this week
print("\n=== Fixing other days this week ===")
cmd_week = 'mysql -u root shiftcrew -N -e "SELECT id, scheduleFor FROM schedules WHERE weekStart <= CURDATE() AND weekEnd >= CURDATE() AND scheduleFor != \'2026-02-26\';"'
stdin, stdout, stderr = ssh.exec_command(cmd_week, timeout=15)
other_days = stdout.read().decode(errors="replace").strip()

for row in other_days.split("\n"):
    if not row.strip():
        continue
    rid, rdate = row.split("\t")[:2]
    
    # Get assignments for this day
    cmd_a = f'mysql -u root shiftcrew -N -e "SELECT assignments FROM schedules WHERE id = \'{rid}\';"'
    stdin, stdout, stderr = ssh.exec_command(cmd_a, timeout=15)
    a_raw = stdout.read().decode(errors="replace").strip()
    try:
        a_list = json.loads(a_raw)
        for i, a in enumerate(a_list):
            if a.get("employeeId") == LUIS_ID and a.get("branchId") != BINAN_ID:
                upd = f"UPDATE schedules SET assignments = JSON_SET(assignments, '$[{i}].branchId', '{BINAN_ID}', '$[{i}].branchName', '{BINAN_NAME}') WHERE id = '{rid}'"
                stdin2, stdout2, stderr2 = ssh.exec_command(f'mysql -u root shiftcrew -e "{upd};"', timeout=15)
                stdout2.read(); stderr2.read()
                print(f"  {rdate}: fixed assignments")
                break
        else:
            print(f"  {rdate}: already correct")
    except:
        print(f"  {rdate}: parse error")

print("\n=== Final verification ===")
stdin, stdout, stderr = ssh.exec_command('mysql -u root shiftcrew -N -e "SELECT assignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"', timeout=15)
raw = stdout.read().decode(errors="replace").strip()
asgn = json.loads(raw)
for a in asgn:
    if a.get("employeeId") == LUIS_ID:
        print(f"Assignments: Luis -> {a.get('branchName')} ({a.get('branchId')})")

stdin, stdout, stderr = ssh.exec_command('mysql -u root shiftcrew -N -e "SELECT branchAssignments FROM schedules WHERE scheduleFor = \'2026-02-26\' LIMIT 1;"', timeout=15)
raw = stdout.read().decode(errors="replace").strip()
ba2 = json.loads(raw)
for bg in ba2:
    for e in bg.get("employees", []):
        if e.get("employeeId") == LUIS_ID:
            print(f"BranchAssignments: Luis -> {bg.get('branchName')} ({bg.get('branchId')})")

ssh.close()
print("\nAll done!")
