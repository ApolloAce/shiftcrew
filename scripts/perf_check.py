import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=30)

cmds = [
    "uptime",
    "free -m",
    "pm2 status",
    "for u in https://shiftcrew.me https://shiftcrew.me/dashboard https://shiftcrew.me/employee https://shiftcrew.me/api/employees?active=true https://shiftcrew.me/api/branches; do echo ==== $u ====; curl -s -o /dev/null -w 'code:%{http_code} dns:%{time_namelookup} connect:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total}\\n' $u; done",
]

for c in cmds:
    print(f"\n$ {c}")
    i,o,e = ssh.exec_command(c, timeout=120)
    print(o.read().decode(errors='ignore'))
    err = e.read().decode(errors='ignore')
    if err.strip():
        print("ERR:", err)

ssh.close()
