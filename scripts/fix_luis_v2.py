"""Fix Luis's schedule - runs commands on the server via SSH"""
import paramiko
import json

HOST = '104.248.217.57'
USER = 'root'
PASS = '@Emorej02e'

SCHEDULE_ID = '35ec7bb8-027c-45c4-a3da-982164a3af7e'
LUIS_ID = 'f44f0554-ebb2-4f95-9963-6a26ff0c61e6'
BINAN_BRANCH_ID = '85fd9967-2a52-4f21-9aa0-9e931cce35ef'
BINAN_BRANCH_NAME = 'Binan Branch'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def ssh_exec(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

# ===== FIX ASSIGNMENTS =====
print("=== FIXING ASSIGNMENTS ===")

# Read current assignments
out, err = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';\"")
if err:
    print(f"Read error: {err}")
    
assignments = json.loads(out)
print(f"Read {len(assignments)} assignment entries")

# Fix Luis
for i, emp in enumerate(assignments):
    eid = emp.get('employeeId', emp.get('id', ''))
    if eid == LUIS_ID:
        old = emp.get('branchName', '?')
        emp['branchId'] = BINAN_BRANCH_ID
        emp['branchName'] = BINAN_BRANCH_NAME
        print(f"Fixed [{i}] Luis: {old} -> {BINAN_BRANCH_NAME}")
        break

# Write back using hex encoding via a SQL file on the server
assignments_json = json.dumps(assignments)
assignments_hex = assignments_json.encode('utf-8').hex()
sql = f"UPDATE schedules SET assignments = X'{assignments_hex}' WHERE id = '{SCHEDULE_ID}';"

# Write SQL to server and execute
sftp = ssh.open_sftp()
with sftp.open('/tmp/fix_a.sql', 'w') as f:
    f.write(sql)
print(f"Wrote SQL file ({len(sql)} bytes)")

out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_a.sql")
if err:
    print(f"Update error: {err}")
else:
    print("assignments UPDATED")

# ===== FIX BRANCHASSIGNMENTS =====
print("\n=== FIXING BRANCHASSIGNMENTS ===")

# Dump branchAssignments to a file on server to avoid command line issues
out, err = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\" > /tmp/ba_raw.txt 2>&1; cat /tmp/ba_raw.txt | head -c 100")
print(f"First 100 chars: {out}")

# Check if it's valid JSON by reading the file
out_check, _ = ssh_exec("wc -c /tmp/ba_raw.txt")
print(f"File size: {out_check}")

# Read the file via SFTP
try:
    with sftp.open('/tmp/ba_raw.txt', 'r') as f:
        raw_ba = f.read().decode().strip()
    print(f"Read {len(raw_ba)} bytes of branchAssignments")
    
    if raw_ba and raw_ba != 'NULL':
        branch_assignments = json.loads(raw_ba)
        print(f"Type: {type(branch_assignments).__name__}")
        
        if isinstance(branch_assignments, dict):
            # Find and remove Luis from Carmona, add to Binan
            luis_entry = None
            for key in list(branch_assignments.keys()):
                ba = branch_assignments[key]
                employees = ba.get('employees', [])
                for emp in employees:
                    eid = emp.get('employeeId', emp.get('id', ''))
                    if eid == LUIS_ID:
                        luis_entry = emp.copy()
                        employees.remove(emp)
                        print(f"Removed Luis from {ba.get('branchName', key)}")
                        ba['employees'] = employees
                        break
            
            if luis_entry:
                luis_entry['branchId'] = BINAN_BRANCH_ID
                luis_entry['branchName'] = BINAN_BRANCH_NAME
                
                # Find Binan branch
                found = False
                for key in branch_assignments:
                    if branch_assignments[key].get('branchId') == BINAN_BRANCH_ID:
                        branch_assignments[key]['employees'].append(luis_entry)
                        print(f"Added Luis to {branch_assignments[key].get('branchName', key)}")
                        found = True
                        break
                
                if not found:
                    branch_assignments[BINAN_BRANCH_ID] = {
                        'branchId': BINAN_BRANCH_ID,
                        'branchName': BINAN_BRANCH_NAME,
                        'employees': [luis_entry]
                    }
                    print(f"Created Binan entry with Luis")
            else:
                print("Luis not found in branchAssignments")
            
            # Write back
            ba_json = json.dumps(branch_assignments)
            ba_hex = ba_json.encode('utf-8').hex()
            sql2 = f"UPDATE schedules SET branchAssignments = X'{ba_hex}' WHERE id = '{SCHEDULE_ID}';"
            
            with sftp.open('/tmp/fix_ba.sql', 'w') as f:
                f.write(sql2)
            
            out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_ba.sql")
            if err:
                print(f"Update error: {err}")
            else:
                print("branchAssignments UPDATED")
        
        elif isinstance(branch_assignments, list):
            print("branchAssignments is a list, iterating...")
            luis_entry = None
            source_idx = None
            for i, item in enumerate(branch_assignments):
                employees = item.get('employees', [])
                for emp in employees:
                    eid = emp.get('employeeId', emp.get('id', ''))
                    if eid == LUIS_ID:
                        luis_entry = emp.copy()
                        employees.remove(emp)
                        source_idx = i
                        print(f"Removed Luis from [{i}] {item.get('branchName', '?')}")
                        break
            
            if luis_entry:
                luis_entry['branchId'] = BINAN_BRANCH_ID
                luis_entry['branchName'] = BINAN_BRANCH_NAME
                
                found = False
                for item in branch_assignments:
                    if item.get('branchId') == BINAN_BRANCH_ID:
                        item['employees'].append(luis_entry)
                        print(f"Added Luis to {item.get('branchName', '?')}")
                        found = True
                        break
                
                if not found:
                    branch_assignments.append({
                        'branchId': BINAN_BRANCH_ID,
                        'branchName': BINAN_BRANCH_NAME,
                        'employees': [luis_entry]
                    })
                    print("Created Binan entry")
                
                ba_json = json.dumps(branch_assignments)
                ba_hex = ba_json.encode('utf-8').hex()
                sql2 = f"UPDATE schedules SET branchAssignments = X'{ba_hex}' WHERE id = '{SCHEDULE_ID}';"
                
                with sftp.open('/tmp/fix_ba.sql', 'w') as f:
                    f.write(sql2)
                
                out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_ba.sql")
                if err:
                    print(f"Update error: {err}")
                else:
                    print("branchAssignments UPDATED")
    else:
        print("branchAssignments is empty/NULL - skipping")
        
except Exception as e:
    print(f"Error processing branchAssignments: {e}")

sftp.close()

# ===== VERIFY =====
print("\n=== VERIFICATION ===")
out, err = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';\"")
if out:
    a = json.loads(out)
    for emp in a:
        eid = emp.get('employeeId', emp.get('id', ''))
        if eid == LUIS_ID:
            print(f"assignments: Luis -> {emp.get('branchName')} ({emp.get('branchId')})")
            break

out2, err2 = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchId FROM users WHERE id = '{LUIS_ID}';\"")
print(f"users.branchId: {out2}")

print("\nDone!")
ssh.close()
