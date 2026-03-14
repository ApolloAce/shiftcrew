"""Diagnose current schedule data and user branchId assignments"""
import paramiko, json

HOST = '104.248.217.57'
USER = 'root'
PASS = '@Emorej02e'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

def ssh_exec(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

# Check all users and their branchId
print("=== ALL USERS branchId ===")
out, _ = ssh_exec("mysql -u root shiftcrew -e \"SELECT id, CONCAT(firstName,' ',surname) as name, branchId, status FROM users WHERE status='approved';\" 2>/dev/null")
print(out)

# Check branches
print("\n=== ALL BRANCHES ===")
out, _ = ssh_exec("mysql -u root shiftcrew -e \"SELECT id, branchName FROM branches;\" 2>/dev/null")
print(out)

# Check today's schedules
print("\n=== TODAY'S SCHEDULES (2026-02-27) ===")
out, _ = ssh_exec("mysql -u root shiftcrew -N -e \"SELECT id, scheduleFor, date FROM schedules WHERE scheduleFor='2026-02-27' OR date='2026-02-27';\" 2>/dev/null")
print(out if out else "No schedules for today")

# Check this week's schedules
print("\n=== THIS WEEK'S SCHEDULES ===")
out, _ = ssh_exec("mysql -u root shiftcrew -N -e \"SELECT id, scheduleFor, date, LEFT(assignments, 100) as asgn_preview FROM schedules WHERE scheduleFor >= '2026-02-23' AND scheduleFor <= '2026-03-01' ORDER BY scheduleFor;\" 2>/dev/null")
print(out if out else "No schedules this week")

# Check yesterday's schedule (the one we fixed for Luis)
print("\n=== YESTERDAY'S FIXED SCHEDULE (2026-02-26) ===")
SCHEDULE_ID = '35ec7bb8-027c-45c4-a3da-982164a3af7e'
out, _ = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE id = '{SCHEDULE_ID}';\"")
if out:
    try:
        assignments = json.loads(out)
        print(f"Type: {type(assignments).__name__}, Count: {len(assignments)}")
        for emp in assignments:
            print(f"  {emp.get('employeeName','?')} -> {emp.get('branchName','?')} ({emp.get('branchId','?')})")
    except Exception as e:
        print(f"Parse error: {e}")
        print(f"Raw: {out[:200]}")

# Check branchAssignments for yesterday
out2, _ = ssh_exec(f"mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE id = '{SCHEDULE_ID}';\"")
if out2 and out2 != 'NULL':
    try:
        ba = json.loads(out2)
        print(f"\nbranchAssignments type: {type(ba).__name__}")
        if isinstance(ba, list):
            for item in ba:
                emps = item.get('employees', [])
                names = [e.get('employeeName','?') for e in emps]
                print(f"  {item.get('branchName','?')}: {names}")
        elif isinstance(ba, dict):
            for key in ba:
                emps = ba[key].get('employees', [])
                names = [e.get('employeeName','?') for e in emps]
                print(f"  {ba[key].get('branchName','?')}: {names}")
    except Exception as e:
        print(f"Parse error: {e}")
else:
    print("branchAssignments: NULL/empty")

# Check ALL schedules for this week with their branchAssignments
print("\n=== ALL WEEK SCHEDULES branchAssignments ===")
out3, _ = ssh_exec("mysql -u root shiftcrew -N -e \"SELECT id, scheduleFor, branchAssignments FROM schedules WHERE scheduleFor >= '2026-02-23' AND scheduleFor <= '2026-03-01' ORDER BY scheduleFor;\" 2>/dev/null")
if out3:
    for line in out3.split('\n'):
        parts = line.split('\t')
        if len(parts) >= 3:
            sid, sfor, raw_ba = parts[0], parts[1], parts[2]
            print(f"\nDate: {sfor} (id: {sid})")
            if raw_ba and raw_ba != 'NULL':
                try:
                    ba = json.loads(raw_ba)
                    if isinstance(ba, list):
                        for item in ba:
                            emps = item.get('employees', [])
                            names = [e.get('employeeName','?') for e in emps]
                            print(f"  {item.get('branchName','?')}: {names}")
                    elif isinstance(ba, dict):
                        for key in ba:
                            emps = ba[key].get('employees', [])
                            names = [e.get('employeeName','?') for e in emps]
                            print(f"  {ba[key].get('branchName','?')}: {names}")
                except Exception as e:
                    print(f"  Parse error: {e}")
            else:
                print("  branchAssignments: NULL")

ssh.close()
print("\nDone!")
