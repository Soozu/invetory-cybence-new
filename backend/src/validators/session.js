import { BlockList, isIP } from 'node:net'
import { z } from 'zod'

const nonPublicV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) nonPublicV4.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const nonPublicV6 = new BlockList()
nonPublicV6.addSubnet('2001:db8::', 32, 'ipv6')
nonPublicV6.addSubnet('3fff::', 20, 'ipv6')

export const sessionPublicIpSchema = z.object({
  sessionId: z.string().min(1).max(128),
  ipAddress: z.string().max(45).ip().refine(value => {
    if (isIP(value) === 4) return !nonPublicV4.check(value, 'ipv4')
    return isIP(value) === 6 && globalV6.check(value, 'ipv6') && !nonPublicV6.check(value, 'ipv6')
  }, 'A public IPv4 or IPv6 address is required.')
}).strict()
