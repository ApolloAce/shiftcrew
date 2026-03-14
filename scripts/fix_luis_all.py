import paramiko, sys, json
sys.stdout.reconfigure(line_buffering=True)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("104.248.217.57", username="root", password="@Emorej02e", timeout=30)
print("Connected")

LUIS_ID = "f44f0554-ebb2-4f95-9963-6a26ff0c61e6"
BINAN_ID = "85fd9967-2a52-4f21-9aa0-9e931cce35ef"
BINAN_NAME = "Binan Branch"

# 1. Fix users.branchId
print("=== Step 1: Fix users.branchId ===")
cmd = f"mysql -u root shiftcrew -e \"UPDATE users SET branchId = '{BINAN_ID}' WHERE id = '{LUIS_ID}';\""
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
stdout.read(); err = stderr.read().decode(errors="replace").strip()
print("ERR:", err) if err else print("OK - users.branchId updated to Binan")

# Verify
cmd = f"mysql -u root shiftcrew -e \"SELECT branchId FROM users WHERE id = '{LUIS_ID}';\""
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
print("Verify:", stdout.read().decode(errors="replace").strip())

# 2. Fix ALL schedule rows for this week
print("\n=== Step 2: Fix schedule assignments ===")
cmd = 'mysql -u root shiftcrew -N -e "SELECT id, scheduleFor, assignments, branchAssignments FROM schedules WHERE weekStart <= CURDATE() AND weekEnd >= CURDATE();"'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
raw = stdout.read().decode(errors="replace").strip()
err = stderr.read().decode(errors="replace").strip()
if err:
    print("ERR:", err)

for row in raw.split("\n"):
    if not row.strip():
        continue
    parts = row.split("\t")
    if len(parts) < 4:
        print(f"  Skipping row with {len(parts)} parts")
        continue
    
    sched_id = parts[0]
    sched_for = parts[1]
    assignments_raw = parts[2]
    ba_raw = parts[3]
    
    updates = []
    
    # Fix assignments JSON
    try:
        assignments = json.loads(assignments_raw)
        a_changed = False
        for a in assignments:
            if a.get("employeeId") == LUIS_ID and a.get("branchId") != BINAN_ID:
                print(f"  {sched_for} assignments: {a.get('branchName')} -> {BINAN_NAME}")
                a["branchId"] = BINAN_ID
                a["branchName"] = BINAN_NAME
                a_changed = True
        if a_changed:
            escaped = json.dumps(assignments).replace("\\", "\\\\").replace("'", "\\'")
            updates.append(f"assignments = '{escaped}'")
    except Exception as e:
        print(f"  {sched_for}: Can't parse assignments: {e}")
    
    # Fix branchAssignments JSON
    try:
        ba = json.loads(ba_raw)
        ba_changed = False
        if isinstance(ba, list):
            luis_entry = None
            # Remove Luis from wrong branch
            for bg in ba:
                emps = bg.get("employees", [])
                for e in list(emps):
                    if e.get("employeeId") == LUIS_ID and bg.get("branchId") != BINAN_ID:
                        luis_entry = e.copy()
                        emps.remove(e)
                        ba_changed = True
                        print(f"  {sched_for} branchAssignments: removed from {bg.get('branchName')}")
            
            if luis_entry:
                # Add to Binan group
                binan_group = next((bg for bg in ba if bg.get("branchId") == BINAN_ID), None)
                if not binan_group:
                    binan_group = {"branchId": BINAN_ID, "branchName": BINAN_NAME, "employees": []}
                    ba.append(binan_group)
                binan_group["employees"].append(luis_entry)
                print(f"  {sched_for} branchAssignments: added to {BINAN_NAME}")
            
            if ba_changed:
                escaped = json.dumps(ba).replace("\\", "\\\\").replace("'", "\\'")
                updates.append(f"branchAssignments = '{escaped}'")
    except Exception as e:
        print(f"  {sched_for}: Can't parse branchAssignments: {e}")
    
    if updates:
        set_clause = ", ".join(updates)
        update_cmd = f'mysql -u root shiftcrew -e "UPDATE schedules SET {set_clause} WHERE id = \'{sched_id}\';"'
        stdin2, stdout2, stderr2 = ssh.exec_command(update_cmd, timeout=15)
        stdout2.read()
        err2 = stderr2.read().decode(errors="replace").strip()
        if err2:
            print(f"    ERR: {err2}")
        else:
            print(f"    UPDATED {sched_id}")
    else:
        print(f"  {sched_for}: already correct")

# 3. Final verification
print("\n=== Step 3: Verify ===")
cmd = f"mysql -u root shiftcrew -e \"SELECT branchId FROM users WHERE id = '{LUIS_ID}';\""
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
print("User branchId:", stdout.read().decode(errors="replace").strip())

cmd = f"mysql -u root shiftcrew -N -e \"SELECT branchName FROM branches WHERE id = (SELECT branchId FROM users WHERE id = '{LUIS_ID}');\""
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
print("User branch name:", stdout.read().decode(errors="replace").strip())

cmd = f"""mysql -u root shiftcrew -N -e "SELECT JSON_UNQUOTE(JSON_EXTRACT(a.val, '$.branchName')) FROM schedules s, JSON_TABLE(s.assignments, '$[*]' COLUMNS(val JSON PATH '$')) a WHERE s.scheduleFor = '2026-02-26' AND JSON_UNQUOTE(JSON_EXTRACT(a.val, '$.employeeId')) = '{LUIS_ID}';" """
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
out = stdout.read().decode(errors="replace").strip()
err = stderr.read().decode(errors="replace").strip()
print("Today schedule branch for Luis:", out or err)

ssh.close()
print("\nDone!")
