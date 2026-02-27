#!/usr/bin/env python3
"""
This script runs ON THE SERVER via SSH.
It connects to MySQL locally, reads the schedule JSON,
modifies Luis's entry, and writes it back using parameterized queries.
"""
import json
import subprocess
import sys

SCHEDULE_ID = '35ec7bb8-027c-45c4-a3da-982164a3af7e'
LUIS_ID = 'f44f0554-ebb2-4f95-9963-6a26ff0c61e6'
BINAN_BRANCH_ID = '85fd9967-2a52-4f21-9aa0-9e931cce35ef'
BINAN_BRANCH_NAME = 'Binan Branch'
CARMONA_BRANCH_ID = 'f9833e41-4d09-433e-b709-3c664f7027d5'
TODAY = '2026-02-26'

def mysql_query(sql):
    """Run a MySQL query and return output"""
    result = subprocess.run(
        ['mysql', '-u', 'root', 'shiftcrew', '-N', '-e', sql],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"MySQL error: {result.stderr}", file=sys.stderr)
        return None
    return result.stdout.strip()

def mysql_exec_file(filepath):
    """Execute a SQL file"""
    result = subprocess.run(
        ['mysql', '-u', 'root', 'shiftcrew'],
        stdin=open(filepath, 'r'),
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"MySQL file error: {result.stderr}", file=sys.stderr)
        return False
    return True

# Step 1: Read assignments
print("Reading assignments...")
raw_assignments = mysql_query(f"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';")
if not raw_assignments:
    print("ERROR: Could not read assignments")
    sys.exit(1)

assignments = json.loads(raw_assignments)
print(f"Got assignments with {len(assignments)} date keys")

# Step 2: Fix Luis in assignments for today
if TODAY in assignments:
    for i, emp in enumerate(assignments[TODAY]):
        if emp.get('id') == LUIS_ID or emp.get('employeeId') == LUIS_ID:
            old_branch = emp.get('branchName', emp.get('branch', 'unknown'))
            emp['branchId'] = BINAN_BRANCH_ID
            emp['branchName'] = BINAN_BRANCH_NAME
            if 'branch' in emp:
                emp['branch'] = BINAN_BRANCH_NAME
            print(f"Fixed Luis in assignments[{TODAY}][{i}]: {old_branch} -> {BINAN_BRANCH_NAME}")
            break
    else:
        print(f"WARNING: Luis not found in assignments for {TODAY}")
else:
    print(f"WARNING: {TODAY} not in assignments keys: {list(assignments.keys())}")

# Step 3: Write updated assignments to a temp file and load it
assignments_json = json.dumps(assignments)
with open('/tmp/fix_assignments.json', 'w') as f:
    f.write(assignments_json)
print(f"Wrote assignments JSON ({len(assignments_json)} bytes)")

# Use a SQL file with hex encoding to avoid escaping
assignments_hex = assignments_json.encode('utf-8').hex()
sql = f"UPDATE schedules SET assignments = X'{assignments_hex}' WHERE id = '{SCHEDULE_ID}';\n"
with open('/tmp/fix_assignments.sql', 'w') as f:
    f.write(sql)

if mysql_exec_file('/tmp/fix_assignments.sql'):
    print("assignments UPDATED successfully")
else:
    print("ERROR: Failed to update assignments")

# Step 4: Read branchAssignments
print("\nReading branchAssignments...")
raw_ba = mysql_query(f"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';")
if not raw_ba:
    print("ERROR: Could not read branchAssignments")
    sys.exit(1)

branch_assignments = json.loads(raw_ba)
print(f"Got branchAssignments with {len(branch_assignments)} branch keys")

# Step 5: Fix Luis in branchAssignments
# Remove Luis from Carmona
for branch_key in list(branch_assignments.keys()):
    ba = branch_assignments[branch_key]
    branch_id = ba.get('branchId', '')
    if branch_id == CARMONA_BRANCH_ID:
        employees = ba.get('employees', [])
        new_employees = [e for e in employees if e.get('id') != LUIS_ID and e.get('employeeId') != LUIS_ID]
        if len(new_employees) < len(employees):
            luis_emp = [e for e in employees if e.get('id') == LUIS_ID or e.get('employeeId') == LUIS_ID][0]
            ba['employees'] = new_employees
            print(f"Removed Luis from {ba.get('branchName', branch_key)} (had {len(employees)}, now {len(new_employees)})")
            
            # Add Luis to Binan
            found_binan = False
            for bk2 in branch_assignments:
                if branch_assignments[bk2].get('branchId') == BINAN_BRANCH_ID:
                    luis_emp['branchId'] = BINAN_BRANCH_ID
                    luis_emp['branchName'] = BINAN_BRANCH_NAME
                    if 'branch' in luis_emp:
                        luis_emp['branch'] = BINAN_BRANCH_NAME
                    branch_assignments[bk2]['employees'].append(luis_emp)
                    print(f"Added Luis to {branch_assignments[bk2].get('branchName', bk2)}")
                    found_binan = True
                    break
            
            if not found_binan:
                # Create Binan entry
                luis_emp['branchId'] = BINAN_BRANCH_ID
                luis_emp['branchName'] = BINAN_BRANCH_NAME
                branch_assignments[BINAN_BRANCH_ID] = {
                    'branchId': BINAN_BRANCH_ID,
                    'branchName': BINAN_BRANCH_NAME,
                    'employees': [luis_emp]
                }
                print(f"Created Binan Branch entry with Luis")
            break

# Step 6: Write updated branchAssignments
ba_json = json.dumps(branch_assignments)
ba_hex = ba_json.encode('utf-8').hex()
sql2 = f"UPDATE schedules SET branchAssignments = X'{ba_hex}' WHERE id = '{SCHEDULE_ID}';\n"
with open('/tmp/fix_ba.sql', 'w') as f:
    f.write(sql2)

if mysql_exec_file('/tmp/fix_ba.sql'):
    print("branchAssignments UPDATED successfully")
else:
    print("ERROR: Failed to update branchAssignments")

# Step 7: Verify
print("\n=== VERIFICATION ===")
raw_a = mysql_query(f"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';")
if raw_a:
    a = json.loads(raw_a)
    if TODAY in a:
        for emp in a[TODAY]:
            if emp.get('id') == LUIS_ID or emp.get('employeeId') == LUIS_ID:
                print(f"assignments: Luis -> {emp.get('branchName', emp.get('branch', '?'))} ({emp.get('branchId', '?')})")
                break

raw_b = mysql_query(f"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';")
if raw_b:
    b = json.loads(raw_b)
    for bk in b:
        for emp in b[bk].get('employees', []):
            if emp.get('id') == LUIS_ID or emp.get('employeeId') == LUIS_ID:
                print(f"branchAssignments: Luis in {b[bk].get('branchName', bk)} ({b[bk].get('branchId', '?')})")
                break

# Also verify users table
raw_u = mysql_query(f"SELECT branchId FROM users WHERE id = '{LUIS_ID}';")
print(f"users.branchId: {raw_u}")
print("\nDone!")
