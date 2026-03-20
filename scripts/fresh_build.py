import paramiko

HOST = "104.248.217.57"
USER = "root"
PASS = "@Emorej02e"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Kill any running builds
print("Killing build...")
i, o, e = c.exec_command("pkill -f 'next build' 2>/dev/null; sleep 3; echo KILLED", timeout=20)
o.channel.settimeout(15)
try:
    print(o.read().decode().strip())
except:
    print("Kill sent (timeout on read, but that's OK)")

# Start fresh build
print("Starting fresh build...")
i, o, e = c.exec_command("cd /var/www/shiftcrew && rm -rf .next && nohup npx next build > /tmp/nextbuild.log 2>&1 < /dev/null & echo $!", timeout=30)
o.channel.settimeout(10)
try:
    pid = o.read().decode().strip()
    print(f"Build started, PID: {pid}")
except:
    print("Build started (timeout on read)")

c.close()
