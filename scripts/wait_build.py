import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('104.248.217.57', username='root', password='@Emorej02e', timeout=15)
print('Waiting for build to complete...')

for i in range(60):
    time.sleep(5)
    _, o, _ = c.exec_command('pgrep -f "next build" | wc -l')
    count = o.read().decode().strip()
    if count == '0':
        print('Build finished!')
        _, o, _ = c.exec_command('tail -30 /var/www/shiftcrew/build_output.txt')
        print(o.read().decode())
        _, o, _ = c.exec_command('pm2 restart shiftcrew 2>&1')
        print(o.read().decode())
        break
    print(f'  Still building... ({i*5}s)')
else:
    print('Timeout waiting for build')
    _, o, _ = c.exec_command('tail -20 /var/www/shiftcrew/build_output.txt')
    print(o.read().decode())

c.close()
