"""Diagnose attendance data vs schedule employee IDs"""
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

# Check today's attendance records
print("=== TODAY'S ATTENDANCE (2026-02-27) ===")
out, _ = ssh_exec("mysql -u root shiftcrew -e \"SELECT id, employeeId, employeeName, status, timeIn, timeOut FROM daily_attendance WHERE date='2026-02-27';\" 2>/dev/null")
print(out if out else "No attendance records for today")

# Also check yesterday
print("\n=== YESTERDAY'S ATTENDANCE (2026-02-26) ===")
out, _ = ssh_exec("mysql -u root shiftcrew -e \"SELECT id, employeeId, employeeName, status, timeIn, timeOut FROM daily_attendance WHERE date='2026-02-26';\" 2>/dev/null")
print(out if out else "No attendance records for yesterday")

# Check today's schedule branchAssignments employee IDs
print("\n=== TODAY'S SCHEDULE EMPLOYEE IDs ===")
out, _ = ssh_exec("mysql -u root shiftcrew -N -e \"SELECT branchAssignments FROM schedules WHERE scheduleFor='2026-02-27';\" 2>/dev/null")
if out and out != 'NULL':
    try:
        ba = json.loads(out)
        if isinstance(ba, list):
            for branch in ba:
                print(f"\n  {branch.get('branchName', '?')}:")
                for emp in branch.get('employees', []):
                    eid = emp.get('employeeId', '?')
                    ename = emp.get('employeeName', '?')
                    print(f"    employeeId={eid} (type={type(eid).__name__}), name={ename}")
        elif isinstance(ba, dict):
            print(f"  WARNING: branchAssignments is a dict, not array!")
            for key in ba:
                item = ba[key]
                print(f"\n  {item.get('branchName', '?')}:")
                for emp in item.get('employees', []):
                    eid = emp.get('employeeId', '?')
                    ename = emp.get('employeeName', '?')
                    print(f"    employeeId={eid} (type={type(eid).__name__}), name={ename}")
    except Exception as e:
        print(f"  Parse error: {e}")
else:
    print("  No branchAssignments for today")

# Also check the flat assignments
print("\n=== TODAY'S FLAT ASSIGNMENTS EMPLOYEE IDs ===")
out2, _ = ssh_exec("mysql -u root shiftcrew -N -e \"SELECT assignments FROM schedules WHERE scheduleFor='2026-02-27';\" 2>/dev/null")
if out2 and out2 != 'NULL':
    try:
        assignments = json.loads(out2)
        for emp in assignments:
            eid = emp.get('employeeId', '?')
            ename = emp.get('employeeName', '?')
            bid = emp.get('branchId', '?')
            bname = emp.get('branchName', '?')
            print(f"  employeeId={eid} (type={type(eid).__name__}), name={ename}, branch={bname}")
    except Exception as e:
        print(f"  Parse error: {e}")

# Check all users table IDs for comparison
print("\n=== USERS TABLE IDs ===")
out3, _ = ssh_exec("mysql -u root shiftcrew -e \"SELECT id, CONCAT(firstName,' ',surname) as name FROM users WHERE status='approved' AND role != 'admin';\" 2>/dev/null")
print(out3)

# Test the /api/attendance endpoint directly
print("\n=== API ATTENDANCE TEST (curl) ===")
out4, _ = ssh_exec("curl -s 'http://localhost:3000/api/attendance?date=2026-02-27' | python3 -m json.tool 2>/dev/null || echo 'curl failed'")
print(out4[:2000] if out4 else "No response")

ssh.close()
print("\nDone!")
