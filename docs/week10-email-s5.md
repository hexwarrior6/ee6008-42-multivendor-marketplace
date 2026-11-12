# Week 10 周报邮件草稿(发给 Prof. Wang)

**Subject: EE6008 Week 10 Status — Seller Analytics Dashboard (S5)**

Dear Prof. Wang,

This week, I built a performance test harness for the seller analytics dashboard and verified that analytics queries do not degrade storefront response times under normal use.

During acceptance testing, I found and fixed a critical bug where the sales analytics API returned 500 for every admin request, so the revenue chart had never received real data. I also seeded real review data through the storefront checkout flow so the sentiment summary aggregates genuine customer reviews, and added branch-naming and PR conventions to AGENTS.md, now enforced by CI.

Under stress-level load the analytics queries can still crowd out storefront latency; the optimization directions are documented and handed to the backend owner. All checks passed.

Best regards,
Zhu Yuhao
