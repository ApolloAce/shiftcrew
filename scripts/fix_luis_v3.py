"""Fix Luis's schedule - v3: handles JSON column type + rebuilds branchAssignments"""
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
sftp = ssh.open_sftp()

def ssh_exec(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

# ===== FIX ASSIGNMENTS =====
print("=== FIXING ASSIGNMENTS ===")

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

# Write using CONVERT to handle JSON column type
assignments_json = json.dumps(assignments)
assignments_hex = assignments_json.encode('utf-8').hex()
sql = f"UPDATE schedules SET assignments = CONVERT(X'{assignments_hex}' USING utf8mb4) WHERE id = '{SCHEDULE_ID}';"

with sftp.open('/tmp/fix_a.sql', 'w') as f:
    f.write(sql)
print(f"Wrote SQL file ({len(sql)} bytes)")

out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_a.sql")
if err:
    print(f"Update error: {err}")
else:
    print("assignments UPDATED OK")

# ===== REBUILD BRANCHASSIGNMENTS =====
print("\n=== REBUILDING BRANCHASSIGNMENTS ===")

# Build branchAssignments from the (now fixed) assignments
branch_map = {}
for emp in assignments:
    bid = emp.get('branchId', '')
    bname = emp.get('branchName', '')
    if bid not in branch_map:
        branch_map[bid] = {
            'branchId': bid,
            'branchName': bname,
            'employees': []
        }
    branch_map[bid]['employees'].append(emp)

print(f"Built branchAssignments with {len(branch_map)} branches:")
for key in branch_map:
    ba = branch_map[key]
    emps = ba['employees']
    names = [e.get('employeeName', '?') for e in emps]
    print(f"  {ba['branchName']}: {names}")

ba_json = json.dumps(branch_map)
ba_hex = ba_json.encode('utf-8').hex()
sql2 = f"UPDATE schedules SET branchAssignments = CONVERT(X'{ba_hex}' USING utf8mb4) WHERE id = '{SCHEDULE_ID}';"

with sftp.open('/tmp/fix_ba.sql', 'w') as f:
    f.write(sql2)

out, err = ssh_exec("mysql -u root shiftcrew < /tmp/fix_ba.sql")
if err:
    print(f"Update error: {err}")
else:
    print("branchAssignments UPDATED OK")

# ===== VERIFY =====
print("\n=== VERIFICATION ===")
out, err = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';\"")
if out:
    a = json.loads(out)
    for emp in a:
        eid = emp.get('employeeId', emp.get('id', ''))
        if eid == LUIS_ID:
            print(f"✓ assignments: Luis -> {emp.get('branchName')} ({emp.get('branchId')})")
            break

# Verify branchAssignments
ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\" > /tmp/ba_verify.txt")
with sftp.open('/tmp/ba_verify.txt', 'r') as f:
    raw = f.read().decode().strip()
if raw and raw != 'NULL':
    ba = json.loads(raw)
    for key in ba:
        for emp in ba[key].get('employees', []):
            eid = emp.get('employeeId', emp.get('id', ''))
            if eid == LUIS_ID:
                print(f"✓ branchAssignments: Luis in {ba[key].get('branchName')} ({ba[key].get('branchId')})")
                break
else:
    print("✗ branchAssignments still NULL")

out2, _ = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchId FROM users WHERE id = '{LUIS_ID}';\"")
print(f"✓ users.branchId: {out2}")

sftp.close()
ssh.close()
print("\nDone!")
