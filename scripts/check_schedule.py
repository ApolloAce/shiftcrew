import json, sys, urllib.request

# Fetch schedule for this week
url = "https://shiftcrew.me/api/schedules?weekStart=2026-03-02"
data = json.loads(urllib.request.urlopen(url).read())

# Check Linda Walker
emp_prefix = "965f418c"
print("=== Linda Walker schedule for week 2026-03-02 ===")
for sched in sorted(data, key=lambda s: s.get("scheduleFor", "")):
    sf = sched.get("scheduleFor", "")
    ba = sched.get("branchAssignments", [])
    if isinstance(ba, str):
        ba = json.loads(ba)
    found = False
    for branch in (ba or []):
        for emp in branch.get("employees", []):
            if emp.get("employeeId", "").startswith(emp_prefix):
                bn = branch.get("branchName", "?")
                sh = emp.get("shift", "?")
                ss = emp.get("shiftStart", "?")
                se = emp.get("shiftEnd", "?")
                print(f"  {sf}: {bn} shift={sh} {ss}-{se}")
                found = True
    if not found:
        print(f"  {sf}: NOT FOUND in schedule")

# Also check attendance
print("\n=== Linda Walker attendance ===")
url2 = "https://shiftcrew.me/api/attendance?employeeId=965f418c-a94e-4806-97ee-0b4f85abf2cc&startDate=2026-02-20&endDate=2026-03-08"
records = json.loads(urllib.request.urlopen(url2).read())
for r in sorted(records, key=lambda x: x.get("date", "")):
    print(f"  {r.get('date')}: status={r.get('status')} branch={r.get('branchName','?')} timeIn={r.get('timeIn','?')} timeOut={r.get('timeOut','?')}")
if not records:
    print("  (no attendance records found)")
