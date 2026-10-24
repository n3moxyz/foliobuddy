# Client IPs through Cloudflare Tunnel

## Problem

A tunnel introduces another proxy before Traefik. A live canary showed the connector gateway as the forwarded client address. A single proxy hop can then share an IP-based rate limit across visitors. FolioBuddy also previously left Express proxy trust disabled.

## Fix

Configure Traefik to accept forwarded headers only from the connector's verified local source address. Configure the application with `TRUSTED_PROXY_CIDRS`, listing only the actual private proxy networks. Express walks the chain from the application and stops at the first untrusted address. This supports the direct route and the longer tunnel route during migration.

Never trust a universal network or an arbitrary number of hops. Preserve the original setting when the new value is absent. Production values and network evidence belong in private operations notes.

## Verification

The regression tests cover direct and tunneled chains, forged prefixes, an unexpected proxy, IPv6, HTTPS detection, and independent rate-limit budgets. Before DNS cutover, verify the actual proxy headers and authenticated browser flows. The unit tests do not prove the deployed network topology.
