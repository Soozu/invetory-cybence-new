export const seedProducts = [
  { id:'p1', name:'ASUS TUF Gaming RTX 4060 Ti OC 8GB', sku:'GPU-ASUS-4060TI-O8G', category:'Components', subcategory:'Graphics Cards', brand:'ASUS', model:'TUF-RTX4060TI-O8G', stock:18, reserved:3, min:8, max:80, reorder:12, cost:28450, warehouse:'Main Warehouse', supplier:'TechSource Distribution', warranty:'36 Months', serialTracking:true, kind:'gpu', barcode:'4801234010018', description:'Factory overclocked graphics card with 8GB GDDR6 memory and triple fan cooling.', created:'2026-05-18' },
  { id:'p2', name:'Samsung 990 Pro 2TB NVMe SSD', sku:'SSD-SAM-990P-2TB', category:'Storage', brand:'Samsung', model:'MZ-V9P2T0BW', stock:42, reserved:6, min:15, max:160, reorder:25, cost:9350, warehouse:'Main Warehouse', supplier:'Pacific Components', warranty:'60 Months', serialTracking:true, kind:'storage', barcode:'4801234010025', description:'High performance PCIe 4.0 NVMe solid state drive for workstations and gaming systems.', created:'2026-06-02' },
  { id:'p3', name:'TP-Link Archer AX55 AX3000 Router', sku:'NET-TPL-AX55', category:'Networking', brand:'TP-Link', model:'Archer AX55', stock:15, reserved:2, min:12, max:70, reorder:20, cost:4290, warehouse:'Bacoor Branch', supplier:'Netlink Technologies', warranty:'24 Months', serialTracking:true, kind:'network', barcode:'4801234010032', description:'Dual band Wi-Fi 6 router with gigabit connectivity for office networks.', created:'2026-04-15' },
  { id:'p4', name:'APC Easy UPS 1000VA', sku:'UPS-APC-1KVA', category:'Power Equipment', brand:'APC', model:'BV1000I-MS', stock:8, reserved:1, min:10, max:55, reorder:18, cost:6480, warehouse:'Main Warehouse', supplier:'PowerGrid Supply', warranty:'24 Months', serialTracking:true, kind:'power', barcode:'4801234010049', description:'Reliable 1000VA backup power for desktops and networking equipment.', created:'2026-03-12' },
  { id:'p5', name:'Dell PowerEdge R760 Rack Server', sku:'SRV-DELL-R760', category:'Servers', brand:'Dell', model:'PowerEdge R760', stock:3, reserved:1, min:4, max:18, reorder:6, cost:289000, warehouse:'Dasma Warehouse', supplier:'Enterprise Systems PH', warranty:'36 Months', serialTracking:true, kind:'server', barcode:'4801234010056', description:'Enterprise rack server built for virtualization and demanding workloads.', created:'2026-07-08' },
  { id:'p6', name:'Hikvision DS-2CD2143G2-I Camera', sku:'CCTV-HIK-2143G2', category:'CCTV', brand:'Hikvision', model:'DS-2CD2143G2-I', stock:24, reserved:4, min:12, max:100, reorder:20, cost:5750, warehouse:'Imus Storage', supplier:'SecureVision Trading', warranty:'24 Months', serialTracking:true, kind:'camera', barcode:'4801234010063', description:'4MP fixed dome network camera with AcuSense technology.', created:'2026-02-26' },
  { id:'p7', name:'Brother DCP-T720DW Ink Tank Printer', sku:'PRN-BRO-T720DW', category:'Printers', brand:'Brother', model:'DCP-T720DW', stock:6, reserved:1, min:8, max:45, reorder:12, cost:11495, warehouse:'Bacoor Branch', supplier:'OfficeTech Wholesale', warranty:'12 Months', serialTracking:true, kind:'printer', barcode:'4801234010070', description:'Wireless three in one ink tank printer for high volume office printing.', created:'2026-01-19' },
  { id:'p8', name:'Lenovo ThinkPad E14 Gen 6', sku:'LAP-LEN-E14G6', category:'Laptops', brand:'Lenovo', model:'21M7002KPH', stock:12, reserved:2, min:8, max:60, reorder:14, cost:47500, warehouse:'Main Warehouse', supplier:'Enterprise Systems PH', warranty:'36 Months', serialTracking:true, kind:'laptop', barcode:'4801234010087', description:'14-inch business laptop with modern performance and enterprise security.', created:'2026-04-06' },
  { id:'p9', name:'Kingston Fury Beast 32GB DDR5', sku:'RAM-KNG-FB32-DDR5', category:'Components', subcategory:'Memory', brand:'Kingston', model:'KF560C36BBEK2-32', stock:64, reserved:8, min:20, max:180, reorder:32, cost:5990, warehouse:'Main Warehouse', supplier:'Pacific Components', warranty:'Lifetime', serialTracking:false, kind:'memory', barcode:'4801234010094', description:'32GB dual channel DDR5 memory kit for next generation desktops.', created:'2026-05-22' },
  { id:'p10', name:'Ubiquiti UniFi U6 Pro Access Point', sku:'NET-UBI-U6PRO', category:'Networking', brand:'Ubiquiti', model:'U6-Pro', stock:0, reserved:0, min:8, max:60, reorder:16, cost:11200, warehouse:'Main Warehouse', supplier:'Netlink Technologies', warranty:'12 Months', serialTracking:true, kind:'network', barcode:'4801234010100', description:'High capacity Wi-Fi 6 access point for office deployments.', created:'2026-04-29' },
  { id:'p11', name:'HP Pro Mini 400 G9 Desktop', sku:'PC-HP-400G9', category:'Computers', brand:'HP', model:'Pro Mini 400 G9', stock:26, reserved:5, min:10, max:80, reorder:18, cost:38900, warehouse:'Dasma Warehouse', supplier:'Enterprise Systems PH', warranty:'36 Months', serialTracking:true, kind:'desktop', barcode:'4801234010117', description:'Compact business desktop with enterprise manageability.', created:'2026-06-14' },
  { id:'p12', name:'Canon imageCLASS MF275dw', sku:'PRN-CAN-MF275DW', category:'Printers', brand:'Canon', model:'MF275dw', stock:4, reserved:0, min:6, max:35, reorder:10, cost:17995, warehouse:'Bacoor Branch', supplier:'OfficeTech Wholesale', warranty:'12 Months', serialTracking:true, kind:'printer', barcode:'4801234010124', description:'Wireless monochrome laser multifunction printer.', created:'2026-02-04' },
  { id:'p13', name:'Seagate IronWolf 8TB NAS HDD', sku:'HDD-SEA-IW8TB', category:'Storage', brand:'Seagate', model:'ST8000VN004', stock:35, reserved:4, min:14, max:100, reorder:24, cost:11250, warehouse:'Imus Storage', supplier:'Pacific Components', warranty:'36 Months', serialTracking:false, kind:'storage', barcode:'4801234010131', description:'Purpose built NAS drive for always on storage systems.', created:'2026-03-17' },
  { id:'p14', name:'Cisco CBS350-24T-4G Switch', sku:'NET-CIS-CBS350', category:'Networking', brand:'Cisco', model:'CBS350-24T-4G', stock:7, reserved:1, min:8, max:40, reorder:12, cost:34900, warehouse:'Main Warehouse', supplier:'Netlink Technologies', warranty:'36 Months', serialTracking:true, kind:'network', barcode:'4801234010148', description:'24 port managed Gigabit switch for business networks.', created:'2026-07-25' },
  { id:'p15', name:'Logitech MX Master 3S Mouse', sku:'ACC-LOG-MX3S', category:'Accessories', brand:'Logitech', model:'MX Master 3S', stock:58, reserved:3, min:18, max:140, reorder:30, cost:4950, warehouse:'Main Warehouse', supplier:'TechSource Distribution', warranty:'12 Months', serialTracking:false, kind:'accessory', barcode:'4801234010155', description:'Ergonomic wireless productivity mouse with quiet clicks.', created:'2026-08-02' },
  { id:'p16', name:'Microsoft 365 Business Standard', sku:'SW-MSC-365BS', category:'Software', brand:'Microsoft', model:'Business Standard', stock:0, reserved:0, min:0, max:0, reorder:0, cost:7950, warehouse:'Digital Licenses', supplier:'TechSource Distribution', warranty:'12 Months', serialTracking:false, kind:'software', barcode:'4801234010162', description:'Annual business productivity subscription license.', created:'2026-01-10', inactive:true }
]

export const seedCategories = [
  {name:'Computers',description:'Desktop PCs and workstations',products:242,stock:1840,status:'Active',children:['Desktop PCs','Gaming PCs','Workstations']},
  {name:'Laptops',description:'Portable computing devices',products:318,stock:1906,status:'Active',children:['Business Laptops','Gaming Laptops']},
  {name:'Servers',description:'Enterprise compute and server parts',products:165,stock:864,status:'Active',children:['Rack Servers','Server Components']},
  {name:'Networking',description:'Routers, switches and connectivity',products:357,stock:2467,status:'Active',children:['Routers','Switches','Access Points','Firewalls','Cables']},
  {name:'CCTV',description:'Security cameras and recorders',products:189,stock:1550,status:'Active',children:['Cameras','DVR / NVR']},
  {name:'Printers',description:'Printers, scanners and supplies',products:162,stock:910,status:'Active',children:['Ink Tank','Laser','Scanners']},
  {name:'Components',description:'PC building components',products:492,stock:2870,status:'Active',children:['CPU','GPU','RAM','Motherboards','Power Supplies','Cooling']},
  {name:'Storage',description:'SSD, HDD and portable storage',products:284,stock:2074,status:'Active',children:['SSD','HDD','USB Drives','Memory Cards']},
  {name:'Accessories',description:'Peripherals and everyday essentials',products:339,stock:2110,status:'Active',children:['Keyboards','Mice','Headsets','Webcams','Adapters','Cables']},
  {name:'Power Equipment',description:'UPS, AVR and power accessories',products:133,stock:920,status:'Active',children:['UPS','AVR','Chargers']},
  {name:'Software',description:'Software licenses and subscriptions',products:95,stock:0,status:'Active',children:['Operating Systems','Productivity','Security']},
  {name:'Mobile Devices',description:'Phones, tablets and accessories',products:71,stock:909,status:'Active',children:['Tablets','Smartphones']}
]

export const seedBrands = ['ASUS','Acer','Lenovo','HP','Dell','MSI','Gigabyte','Samsung','Kingston','Western Digital','Seagate','TP-Link','Ubiquiti','Cisco','APC','Epson','Brother','Canon','Hikvision','Dahua','Logitech','Microsoft'].map((name,i)=>({name,products:[183,97,152,224,195,94,86,147,125,78,89,118,67,54,72,112,98,91,75,63,109,38][i],stock:[1290,636,928,1450,812,501,443,1197,872,511,622,748,411,218,402,713,549,558,508,390,836,0][i],status:'Active'}))

export const seedWarehouses = [
  {id:'w1',name:'Main Warehouse',location:'Cavite City, Cavite',products:1426,units:9780,value:10850240,manager:'Marco Reyes',status:'Operational',code:'MWH'},
  {id:'w2',name:'Bacoor Branch',location:'Bacoor, Cavite',products:682,units:3842,value:3589900,manager:'Alyssa Cruz',status:'Operational',code:'BCR'},
  {id:'w3',name:'Dasma Warehouse',location:'Dasmariñas, Cavite',products:415,units:2501,value:2956410,manager:'Rafael Santos',status:'Operational',code:'DSA'},
  {id:'w4',name:'Imus Storage',location:'Imus, Cavite',products:270,units:1836,value:1257880,manager:'Nicole Garcia',status:'Operational',code:'IMS'},
  {id:'w5',name:'Service Center',location:'General Trias, Cavite',products:54,units:461,value:96000,manager:'Paolo Mendoza',status:'Operational',code:'SVC'}
]

export const seedSuppliers = [
  {id:'s1',name:'TechSource Distribution',contact:'Andrea Lim',email:'andrea@techsource.ph',phone:'+63 917 652 4108',products:385,orders:42,status:'Active',address:'Makati City, Metro Manila',taxId:'009-431-728-000',terms:'Net 30',notes:'Preferred supplier for graphics cards and peripherals.'},
  {id:'s2',name:'Pacific Components',contact:'Miguel Torres',email:'miguel@pacificcomponents.ph',phone:'+63 918 210 7643',products:291,orders:36,status:'Active',address:'Pasig City, Metro Manila',taxId:'008-739-221-000',terms:'Net 30',notes:'Storage and memory specialist.'},
  {id:'s3',name:'Netlink Technologies',contact:'Bea Ramos',email:'bea@netlink.ph',phone:'+63 917 336 8042',products:217,orders:28,status:'Active',address:'Quezon City, Metro Manila',taxId:'006-142-517-000',terms:'Net 45',notes:'Network infrastructure partner.'},
  {id:'s4',name:'Enterprise Systems PH',contact:'Daniel Tan',email:'daniel@enterprisesystems.ph',phone:'+63 918 475 0992',products:174,orders:31,status:'Active',address:'Taguig City, Metro Manila',taxId:'010-619-455-000',terms:'Net 30',notes:'Servers, desktops and business laptops.'},
  {id:'s5',name:'PowerGrid Supply',contact:'Sofia Mercado',email:'sofia@powergrid.ph',phone:'+63 917 608 3321',products:91,orders:19,status:'Active',address:'Mandaluyong City, Metro Manila',taxId:'004-862-990-000',terms:'Net 15',notes:'Power protection products.'},
  {id:'s6',name:'SecureVision Trading',contact:'Karl Villanueva',email:'karl@securevision.ph',phone:'+63 918 544 1132',products:146,orders:24,status:'Active',address:'Manila, Metro Manila',taxId:'011-284-632-000',terms:'Net 30',notes:'CCTV and access control devices.'},
  {id:'s7',name:'OfficeTech Wholesale',contact:'Lara Bautista',email:'lara@officetech.ph',phone:'+63 917 445 7632',products:132,orders:22,status:'Active',address:'Parañaque City, Metro Manila',taxId:'007-533-810-000',terms:'Net 30',notes:'Printers and office equipment.'}
]

export const seedOrders = [
  {id:'po1',number:'PO-2026-00481',supplier:'Pacific Components',warehouse:'Main Warehouse',items:3,amount:286750,date:'2026-09-26',expected:'2026-09-30',status:'Received',createdBy:'Christian Dela Cruz',lines:[{productId:'p2',quantity:25,received:25,cost:9350}]},
  {id:'po2',number:'PO-2026-00480',supplier:'TechSource Distribution',warehouse:'Main Warehouse',items:4,amount:498600,date:'2026-09-24',expected:'2026-10-04',status:'Ordered',createdBy:'Christian Dela Cruz',lines:[{productId:'p1',quantity:12,received:0,cost:28450},{productId:'p15',quantity:20,received:0,cost:4950}]},
  {id:'po3',number:'PO-2026-00479',supplier:'Netlink Technologies',warehouse:'Bacoor Branch',items:2,amount:174800,date:'2026-09-22',expected:'2026-10-02',status:'Partial',createdBy:'Maria Santos',lines:[{productId:'p3',quantity:20,received:8,cost:4290},{productId:'p10',quantity:8,received:0,cost:11200}]},
  {id:'po4',number:'PO-2026-00478',supplier:'Enterprise Systems PH',warehouse:'Dasma Warehouse',items:1,amount:867000,date:'2026-09-18',expected:'2026-10-10',status:'Approved',createdBy:'Christian Dela Cruz',lines:[{productId:'p5',quantity:3,received:0,cost:289000}]},
  {id:'po5',number:'PO-2026-00477',supplier:'PowerGrid Supply',warehouse:'Main Warehouse',items:2,amount:129600,date:'2026-09-15',expected:'2026-09-29',status:'Pending Approval',createdBy:'Maria Santos',lines:[{productId:'p4',quantity:20,received:0,cost:6480}]}
]

export const seedTransfers = [
  {id:'t1',number:'TRF-2026-00152',from:'Main Warehouse',to:'Bacoor Branch',items:3,quantity:20,productId:'p2',requestedBy:'Marco Reyes',date:'2026-09-27',status:'In Transit',notes:'Branch replenishment'},
  {id:'t2',number:'TRF-2026-00151',from:'Main Warehouse',to:'Dasma Warehouse',items:2,quantity:12,productId:'p9',requestedBy:'Marco Reyes',date:'2026-09-24',status:'Received',notes:'Workstation build stock'},
  {id:'t3',number:'TRF-2026-00150',from:'Imus Storage',to:'Service Center',items:1,quantity:4,productId:'p6',requestedBy:'Nicole Garcia',date:'2026-09-21',status:'Pending',notes:'Installation requirement'}
]

export const seedMovements = [
  {id:'m1',date:'2026-09-29 09:42',reference:'RCV-2026-00341',productId:'p2',movement:'Stock In',quantity:25,from:'Pacific Components',to:'Main Warehouse',by:'Marco Reyes',notes:'PO-2026-00481 received'},
  {id:'m2',date:'2026-09-28 15:18',reference:'TRF-2026-00152',productId:'p3',movement:'Transfer',quantity:3,from:'Main Warehouse',to:'Bacoor Branch',by:'Alyssa Cruz',notes:'Branch replenishment'},
  {id:'m3',date:'2026-09-28 11:05',reference:'ADJ-2026-00216',productId:'p4',movement:'Stock In',quantity:10,from:'PowerGrid Supply',to:'Main Warehouse',by:'Marco Reyes',notes:'Opening stock correction'},
  {id:'m4',date:'2026-09-27 14:22',reference:'AST-000184',productId:'p1',movement:'Stock Out',quantity:1,from:'Main Warehouse',to:'IT Department',by:'Christian Dela Cruz',notes:'Assigned as company asset'},
  {id:'m5',date:'2026-09-26 10:14',reference:'ADJ-2026-00215',productId:'p9',movement:'Adjustment',quantity:-2,from:'Main Warehouse',to:'—',by:'Marco Reyes',notes:'Damaged during inspection'}
]

export const seedSerials = [
  {id:'sn1',serial:'TUF4060-8G-00921',productId:'p1',warehouse:'Main Warehouse',po:'PO-2026-00457',supplier:'TechSource Distribution',start:'2026-08-11',end:'2029-08-11',status:'Available',assignedTo:'—'},
  {id:'sn2',serial:'TUF4060-8G-00484',productId:'p1',warehouse:'Main Warehouse',po:'PO-2026-00412',supplier:'TechSource Distribution',start:'2026-06-07',end:'2029-06-07',status:'Assigned',assignedTo:'Juan Dela Cruz'},
  {id:'sn3',serial:'S990P2TB-482910',productId:'p2',warehouse:'Main Warehouse',po:'PO-2026-00481',supplier:'Pacific Components',start:'2026-09-29',end:'2031-09-29',status:'Available',assignedTo:'—'},
  {id:'sn4',serial:'DLR760-2026-0187',productId:'p5',warehouse:'Dasma Warehouse',po:'PO-2026-00401',supplier:'Enterprise Systems PH',start:'2026-07-08',end:'2029-07-08',status:'Reserved',assignedTo:'—'},
  {id:'sn5',serial:'LNE14G6-PF4X882',productId:'p8',warehouse:'Main Warehouse',po:'PO-2026-00427',supplier:'Enterprise Systems PH',start:'2026-08-04',end:'2029-08-04',status:'Assigned',assignedTo:'Juan Dela Cruz'},
  {id:'sn6',serial:'APC1K-AV32458',productId:'p4',warehouse:'Service Center',po:'PO-2026-00385',supplier:'PowerGrid Supply',start:'2026-04-20',end:'2028-04-20',status:'For Repair',assignedTo:'—'},
  {id:'sn7',serial:'AX55-02261-0918',productId:'p3',warehouse:'Bacoor Branch',po:'PO-2026-00444',supplier:'Netlink Technologies',start:'2026-08-15',end:'2028-08-15',status:'Available',assignedTo:'—'}
]

export const seedAssets = [
  {id:'a1',tag:'AST-000184',productId:'p8',serial:'LNE14G6-PF4X882',assignedTo:'Juan Dela Cruz',department:'IT Department',location:'Head Office',purchaseDate:'2026-08-04',dateAssigned:'2026-09-20',warrantyEnd:'2029-08-04',status:'Assigned'},
  {id:'a2',tag:'AST-000183',productId:'p11',serial:'HP400G9-92184',assignedTo:'Maria Santos',department:'Procurement',location:'Head Office',purchaseDate:'2026-06-14',dateAssigned:'2026-08-26',warrantyEnd:'2029-06-14',status:'Assigned'},
  {id:'a3',tag:'AST-000182',productId:'p5',serial:'DLR760-2026-0187',assignedTo:'',department:'Infrastructure',location:'Dasma Warehouse',purchaseDate:'2026-07-08',dateAssigned:'',warrantyEnd:'2029-07-08',status:'Available'},
  {id:'a4',tag:'AST-000181',productId:'p7',serial:'BRO720-66392',assignedTo:'Alyssa Cruz',department:'Operations',location:'Bacoor Branch',purchaseDate:'2025-11-04',dateAssigned:'2025-12-01',warrantyEnd:'2026-11-04',status:'Assigned'},
  {id:'a5',tag:'AST-000180',productId:'p4',serial:'APC1K-AV32458',assignedTo:'',department:'IT Department',location:'Service Center',purchaseDate:'2026-04-20',dateAssigned:'',warrantyEnd:'2028-04-20',status:'Maintenance'}
]

export const seedMaintenance = [
  {id:'mnt1',asset:'AST-000180',serial:'APC1K-AV32458',issue:'Battery no longer holding charge',technician:'Paolo Mendoza',date:'2026-09-27',cost:1850,status:'In Repair'},
  {id:'mnt2',asset:'AST-000177',serial:'BRO720-59024',issue:'Printhead cleaning and calibration',technician:'Nico Valencia',date:'2026-09-19',cost:950,status:'Completed'},
  {id:'mnt3',asset:'AST-000171',serial:'HP400G9-90912',issue:'Intermittent boot failure',technician:'Paolo Mendoza',date:'2026-10-03',cost:0,status:'Scheduled'}
]

export const seedUsers = [
  {id:'u1',name:'Christian Dela Cruz',email:'christian@techstock.ph',role:'Administrator',warehouse:'All locations',status:'Active',lastLogin:'Today, 9:41 AM',initials:'CD'},
  {id:'u2',name:'Marco Reyes',email:'marco@techstock.ph',role:'Inventory Manager',warehouse:'Main Warehouse',status:'Active',lastLogin:'Today, 8:52 AM',initials:'MR'},
  {id:'u3',name:'Alyssa Cruz',email:'alyssa@techstock.ph',role:'Warehouse Staff',warehouse:'Bacoor Branch',status:'Active',lastLogin:'Yesterday, 4:18 PM',initials:'AC'},
  {id:'u4',name:'Maria Santos',email:'maria@techstock.ph',role:'Procurement Officer',warehouse:'All locations',status:'Active',lastLogin:'Today, 10:02 AM',initials:'MS'},
  {id:'u5',name:'Nicole Garcia',email:'nicole@techstock.ph',role:'Asset Manager',warehouse:'Imus Storage',status:'Active',lastLogin:'Sep 27, 2026',initials:'NG'},
  {id:'u6',name:'Rafael Santos',email:'rafael@techstock.ph',role:'Viewer',warehouse:'Dasma Warehouse',status:'Inactive',lastLogin:'Sep 12, 2026',initials:'RS'}
]

export const seedLogs = [
  {id:'l1',date:'Sep 29, 2026 · 09:42',user:'Marco Reyes',action:'Received',module:'Purchasing',description:'Received PO-2026-00481 into Main Warehouse.',ip:'192.168.1.24'},
  {id:'l2',date:'Sep 28, 2026 · 15:18',user:'Alyssa Cruz',action:'Transferred',module:'Inventory',description:'Transferred 3 TP-Link Archer AX55 units.',ip:'192.168.1.35'},
  {id:'l3',date:'Sep 27, 2026 · 14:22',user:'Christian Dela Cruz',action:'Assigned',module:'Assets',description:'Assigned asset AST-000184 to Juan Dela Cruz.',ip:'192.168.1.12'},
  {id:'l4',date:'Sep 26, 2026 · 10:14',user:'Marco Reyes',action:'Adjusted',module:'Inventory',description:'Adjusted Kingston Fury Beast 32GB stock by -2.',ip:'192.168.1.24'},
  {id:'l5',date:'Sep 24, 2026 · 16:37',user:'Maria Santos',action:'Created',module:'Purchasing',description:'Created PO-2026-00480 for TechSource Distribution.',ip:'192.168.1.19'}
]

export const seedNotifications = [
  {id:'n1',title:'Low stock alert',message:'APC Easy UPS 1000VA is below its minimum stock level.',time:'8 min ago',type:'warning',read:false,path:'/monitoring/low-stock'},
  {id:'n2',title:'Warranty expiring',message:'Brother DCP-T720DW warranty expires in 36 days.',time:'2 hours ago',type:'warning',read:false,path:'/assets/warranties'},
  {id:'n3',title:'Purchase order received',message:'PO-2026-00481 was received at Main Warehouse.',time:'Yesterday',type:'success',read:false,path:'/procurement/purchase-orders'},
  {id:'n4',title:'Transfer in transit',message:'TRF-2026-00152 is on its way to Bacoor Branch.',time:'Yesterday',type:'info',read:true,path:'/inventory/transfers'}
]

export const chartSeries = {
  '7 Days':[{day:'Mon',in:105,out:72},{day:'Tue',in:148,out:91},{day:'Wed',in:121,out:82},{day:'Thu',in:172,out:113},{day:'Fri',in:158,out:104},{day:'Sat',in:92,out:63},{day:'Sun',in:124,out:78}],
  '30 Days':[{day:'1 Sep',in:420,out:285},{day:'5 Sep',in:510,out:338},{day:'9 Sep',in:485,out:310},{day:'13 Sep',in:635,out:386},{day:'17 Sep',in:562,out:352},{day:'21 Sep',in:714,out:440},{day:'25 Sep',in:629,out:392},{day:'29 Sep',in:790,out:461}],
  '3 Months':[{day:'Jul W1',in:880,out:540},{day:'Jul W3',in:980,out:605},{day:'Aug W1',in:1030,out:660},{day:'Aug W3',in:1120,out:710},{day:'Sep W1',in:1080,out:690},{day:'Sep W3',in:1275,out:780}],
  '6 Months':[{day:'Apr',in:2420,out:1620},{day:'May',in:2680,out:1720},{day:'Jun',in:2510,out:1670},{day:'Jul',in:2890,out:1870},{day:'Aug',in:3020,out:1970},{day:'Sep',in:3280,out:2080}],
  '1 Year':[{day:'Oct',in:2300,out:1510},{day:'Dec',in:2490,out:1580},{day:'Feb',in:2700,out:1680},{day:'Apr',in:2600,out:1650},{day:'Jun',in:2910,out:1890},{day:'Aug',in:3150,out:2040},{day:'Sep',in:3280,out:2080}]
}

export const categoryShare = [
  {name:'Components',value:29,color:'#3569e8'},{name:'Networking',value:19,color:'#6992f2'},{name:'Laptops',value:15,color:'#9baff4'},{name:'Storage',value:13,color:'#c0c9f4'},{name:'Computers',value:10,color:'#819bd2'},{name:'Other',value:14,color:'#dbe2ef'}
]
