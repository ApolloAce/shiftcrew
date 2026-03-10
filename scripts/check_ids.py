import json, urllib.request

# Fetch employees 
data = json.loads(urllib.request.urlopen("https://shiftcrew.me/api/employees").read())

# Schedule employee IDs
sched_ids = set([
    '25af4342-654c-468b-8086-e9f0bffdd9d4','29343a00-3f65-4362-9c4e-8550a4fce9e6',
    '43753bd2-b31d-433e-aa3d-8c76c5cf8327','439de77c-9278-41a2-af24-949820720c89',
    '43a8ceda-0f6a-4629-a9fb-f5707e7a79ba','4f572d63-3e55-44ea-8203-7a68686b7b0c',
    '57cf7194-28ab-47f5-b6ce-54a623861372','5982d00f-d9c1-481a-b16a-50eda08cb887',
    '67877d6a-daf1-4ad4-9bd1-f2b7e8bb82a1','7a1c376a-a67b-40ea-b164-d754b1b42447',
    '90f325e8-bb53-4359-a83c-ca8583407b0e','9860bb62-a837-4af2-ad8b-a3927e39ce55',
    '9e4f9f97-3bd8-4daf-905f-c8a4f4eeacb9','a681bbad-6a28-46cd-97a4-9e6a838a0886',
    'a964c3d4-5866-4aa5-9eb6-c68dfc0d846f','bc480616-3010-4906-8274-04f764ca2238',
    'c832c8ea-807f-4b46-a7a1-de03f74d607c','ce7365ac-0899-4e1f-a05f-0291dc3edff2',
    'dc19fc5e-bda0-4995-a43a-020c3985531b','eda07a7e-37da-4460-8718-0006f94c8567',
    'f22a4ddd-3612-4862-9bb7-61cff9f74293','f5900cf2-7a7d-480d-8a07-33d53d09285e',
    'f76b3d5b-977d-4f2c-8fc6-05c9cf6b391a'
])

# Attendance employee IDs
att_data = json.loads(urllib.request.urlopen("https://shiftcrew.me/api/attendance?startDate=2026-02-01&endDate=2026-03-08").read())
att_ids = set(r.get('employeeId','') for r in att_data)

print("--- Employees in DB vs Schedule vs Attendance ---")
for e in sorted(data, key=lambda x: x.get('firstName','')):
    eid = e['id']
    name = e.get('firstName','') + ' ' + e.get('surname','')
    in_s = 'SCHED' if eid in sched_ids else '     '
    in_a = 'ATT' if eid in att_ids else '   '
    print(f"  {eid}  {in_s}  {in_a}  {name}")

print("\n--- Attendance IDs NOT in employees table ---")
emp_ids = set(e['id'] for e in data)
for aid in att_ids:
    if aid not in emp_ids:
        # find name from att_data
        names = set(r.get('employeeName','?') for r in att_data if r.get('employeeId')==aid)
        print(f"  {aid}  names={names}")
