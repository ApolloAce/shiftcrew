import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

i, o, e = c.exec_command('grep -c "totalMinutes" /var/www/shiftcrew/app/api/attendance/route.ts', timeout=15)
print("totalMinutes matches:", o.read().decode().strip())

i, o, e = c.exec_command('grep "540" /var/www/shiftcrew/app/api/attendance/route.ts', timeout=15)
print("540 line:", o.read().decode().strip())

c.close()
