import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print("Connecting...")
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

LUIS_ID = "f44f0554-ebb2-4f95-9963-6a26ff0c61e6"
BINAN_ID = "85fd9967-2a52-4f21-9aa0-9e931cce35ef"
BINAN_NAME = "Binan Branch"

# Get all schedules for this week that contain Luis
cmd = 'mysql -u root shiftcrew -N -e "SELECT id, scheduleFor, assignments FROM schedules WHERE weekStart <= CURDATE() AND weekEnd >= CURDATE() ORDER BY scheduleFor;"'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
rows = stdout.read().decode(errors="replace").strip().split("\n")
err = stderr.read().decode(errors="replace").strip()
if err:
    print("ERR:", err)

print(f"Found {len(rows)} schedule rows for this week")

updated = 0
for row in rows:
    if not row.strip():
        continue
    parts = row.split("\t")
    if len(parts) < 3:
        continue
    sched_id = parts[0]
    sched_for = parts[1]
    assignments_raw = parts[2]
    
    try:
        assignments = json.loads(assignments_raw)
    except:
        print(f"  Skip {sched_id} ({sched_for}) - can't parse JSON")
        continue
    
    changed = False
    for a in assignments:
        if a.get("employeeId") == LUIS_ID:
            old_branch = a.get("branchName", "?")
            if a.get("branchId") != BINAN_ID:
                a["branchId"] = BINAN_ID
                a["branchName"] = BINAN_NAME
                changed = True
                print(f"  {sched_for}: Luis {old_branch} -> {BINAN_NAME}")
            else:
                print(f"  {sched_for}: Luis already at {BINAN_NAME}")
    
    if changed:
        new_json = json.dumps(assignments).replace("'", "\\'")
        update_cmd = f"""mysql -u root shiftcrew -e "UPDATE schedules SET assignments = '{new_json}' WHERE id = '{sched_id}';" """
        stdin2, stdout2, stderr2 = ssh.exec_command(update_cmd, timeout=15)
        out2 = stdout2.read().decode(errors="replace")
        err2 = stderr2.read().decode(errors="replace").strip()
        if err2:
            print(f"    ERR updating {sched_id}: {err2}")
        else:
            updated += 1
            print(f"    Updated schedule {sched_id}")

# Also fix branchAssignments column (structured format)
cmd2 = 'mysql -u root shiftcrew -N -e "SELECT id, scheduleFor, branchAssignments FROM schedules WHERE weekStart <= CURDATE() AND weekEnd >= CURDATE() ORDER BY scheduleFor;"'
stdin, stdout, stderr = ssh.exec_command(cmd2, timeout=15)
rows2 = stdout.read().decode(errors="replace").strip().split("\n")

print(f"\nChecking branchAssignments in {len(rows2)} rows...")
for row in rows2:
    if not row.strip():
        continue
    parts = row.split("\t")
    if len(parts) < 3:
        continue
    sched_id = parts[0]
    sched_for = parts[1]
    ba_raw = parts[2]
    
    try:
        ba = json.loads(ba_raw)
    except:
        continue
    
    if not isinstance(ba, list):
        continue
    
    changed = False
    # Remove Luis from wrong branch, add to Binan
    luis_entry = None
    for branch_group in ba:
        emps = branch_group.get("employees", [])
        for e in emps:
            if e.get("employeeId") == LUIS_ID:
                if branch_group.get("branchId") != BINAN_ID:
                    luis_entry = e.copy()
                    emps.remove(e)
                    changed = True
                    print(f"  {sched_for}: Removed Luis from {branch_group.get('branchName')}")
                break
    
    if luis_entry and changed:
        # Find or create Binan group
        binan_group = None
        for bg in ba:
            if bg.get("branchId") == BINAN_ID:
                binan_group = bg
                break
        if not binan_group:
            binan_group = {"branchId": BINAN_ID, "branchName": BINAN_NAME, "employees": []}
            ba.append(binan_group)
        binan_group["employees"].append(luis_entry)
        print(f"  {sched_for}: Added Luis to {BINAN_NAME} in branchAssignments")
    
    if changed:
        new_json = json.dumps(ba).replace("'", "\\'")
        update_cmd = f"""mysql -u root shiftcrew -e "UPDATE schedules SET branchAssignments = '{new_json}' WHERE id = '{sched_id}';" """
        stdin2, stdout2, stderr2 = ssh.exec_command(update_cmd, timeout=15)
        err2 = stderr2.read().decode(errors="replace").strip()
        if err2:
            print(f"    ERR: {err2}")
        else:
            updated += 1
            print(f"    Updated branchAssignments {sched_id}")

print(f"\nTotal updates: {updated}")

# Verify
cmd3 = f'mysql -u root shiftcrew -N -e "SELECT scheduleFor, JSON_EXTRACT(assignments, \'$[*].branchName\') FROM schedules WHERE scheduleFor = CURDATE() LIMIT 1;"'
stdin, stdout, stderr = ssh.exec_command(cmd3, timeout=15)
print("\n=== Verify today ===")
print(stdout.read().decode(errors="replace"))

ssh.close()
print("Done")
