import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e')

# Kill any stale builds
print("Killing stale builds...")
c.exec_command('pkill -9 -f "next build" 2>/dev/null')
time.sleep(3)

# Check build log
_, o, _ = c.exec_command('tail -30 /var/www/shiftcrew/build_output.txt 2>/dev/null')
print("=== BUILD LOG (tail) ===")
print(o.read().decode('utf-8', errors='replace'))

# Check if cron route file exists
_, o, _ = c.exec_command('ls -la /var/www/shiftcrew/app/api/cron/rotate/route.ts 2>&1')
print("=== CRON ROUTE FILE ===")
print(o.read().decode('utf-8', errors='replace'))

# Start fresh build and wait
print("Starting fresh build...")
_, o, e = c.exec_command('cd /var/www/shiftcrew && npm run build 2>&1 && pm2 restart shiftcrew && echo DONE')

while True:
    if o.channel.exit_status_ready():
        break
    time.sleep(10)
    print("  building...")

result = o.read().decode('utf-8', errors='replace')
err = e.read().decode('utf-8', errors='replace')
exit_code = o.channel.recv_exit_status()

print("OUTPUT (tail):", result[-800:])
if err:
    print("STDERR:", err[-300:])
print("EXIT CODE:", exit_code)

if exit_code == 0:
    print("BUILD + DEPLOY SUCCESS!")
else:
    print("BUILD FAILED!")

c.close()
