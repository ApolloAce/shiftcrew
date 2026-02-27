"""Upload and run a diagnostic to see the assignments structure"""
import paramiko
import json

HOST = '104.248.217.57'
USER = 'root'
PASS = '@Emorej02e'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

SCHEDULE_ID = '35ec7bb8-027c-45c4-a3da-982164a3af7e'
LUIS_ID = 'f44f0554-ebb2-4f95-9963-6a26ff0c61e6'

# Read assignments
cmd = f"mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';\""
stdin, stdout, stderr = ssh.exec_command(cmd)
raw = stdout.read().decode().strip()
err = stderr.read().decode().strip()
if err:
    print(f"Error: {err}")

assignments = json.loads(raw)
print(f"Type: {type(assignments).__name__}, Length: {len(assignments)}")
if isinstance(assignments, list):
    for i, item in enumerate(assignments):
        eid = item.get('id', item.get('employeeId', '?'))
        name = item.get('name', item.get('employeeName', '?'))
        branch = item.get('branchName', item.get('branch', '?'))
        bid = item.get('branchId', '?')
        is_luis = ' *** LUIS ***' if eid == LUIS_ID else ''
        print(f"  [{i}] {name} -> {branch} ({bid}){is_luis}")
        if is_luis:
            print(f"       Full object keys: {list(item.keys())}")
elif isinstance(assignments, dict):
    print(f"Keys: {list(assignments.keys())}")
    for key in assignments:
        val = assignments[key]
        if isinstance(val, list):
            print(f"  {key}: {len(val)} items")
            for i, item in enumerate(val):
                eid = item.get('id', item.get('employeeId', '?'))
                if eid == LUIS_ID:
                    print(f"    [{i}] LUIS: {item}")
        else:
            print(f"  {key}: {type(val).__name__}")

# Read branchAssignments
print("\n--- branchAssignments ---")
cmd2 = f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\""
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
raw2 = stdout2.read().decode().strip()
err2 = stderr2.read().decode().strip()
if err2:
    print(f"Error: {err2}")
if raw2:
    ba = json.loads(raw2)
    print(f"Type: {type(ba).__name__}, Length: {len(ba)}")
    if isinstance(ba, dict):
        for key in ba:
            item = ba[key]
            bname = item.get('branchName', '?')
            emps = item.get('employees', [])
            print(f"  {key}: {bname} ({len(emps)} employees)")
            for e in emps:
                eid = e.get('id', e.get('employeeId', '?'))
                if eid == LUIS_ID:
                    print(f"    -> LUIS is here! Keys: {list(e.keys())}")
    elif isinstance(ba, list):
        for i, item in enumerate(ba):
            bname = item.get('branchName', '?')
            emps = item.get('employees', [])
            print(f"  [{i}] {bname} ({len(emps)} employees)")
            for e in emps:
                eid = e.get('id', e.get('employeeId', '?'))
                if eid == LUIS_ID:
                    print(f"    -> LUIS is here! Keys: {list(e.keys())}")
else:
    print("branchAssignments is empty!")

ssh.close()
