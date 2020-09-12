# Simple TCP socket proxy

This proxy was originally designed to allow a user to ssh into a Ubuntu multipass VM from the host machine or the Internet.

I am amazed about the simplicity and performance of the proxy, thus polishing it to become a generic socket proxy that you can use to do network address translation (NAT) from a host port to a guest VM target IP and port.

## proxy-config.json

The IP discovery command, source and target ports are configurable using a JSON file like this. You may adjust the configuration file to fit your use case.

```json
{
  "discovery": {
    "command": "multipass exec main ifconfig eth0",
    "tag": "inet",
    "index": 1
  },
  "source_port": 22,
  "target_port": 22
}
```

## SSH security

If you use this to expose your guest VM to the Internet, make sure you use certificate authentication and disable password authentication. You should also use SSH certificate of 4,096 bits for security reason.

If you are using Multipass, you can replace the original SSH certificate with a 4,096-bit certificate.

## Running this utility as a service

We recommend that you use Node's PM2 process manager to deploy the utility as a service.

It is as simple as:

```
pm2 start simple-proxy.js
```
This assumes you start the utility from the project directory. If not, please add path to the filename.

## Library dependencies

Please install the moment time utility before you start the utility.

```
cd simple-proxy
npm install moment
```

Hope you enjoy this utility for your projects.

9/12/2020
