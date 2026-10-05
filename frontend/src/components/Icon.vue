<script setup>
// ไอคอน SVG ในตัว (ไม่ต้องโหลด icon font จาก CDN)
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 18 } });

const PATHS = {
    plus: 'M12 5v14M5 12h14',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    alert: 'M12 3 2 21h20L12 3Zm0 6v5m0 3.5v.5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
    pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7l-6 6ZM7 10l7 7',
    users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
    key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7Zm1 2.5h.01',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
    auto: 'M12 3a9 9 0 1 0 0 18V3Z M12 3a9 9 0 0 1 0 18',
    upload: 'M12 16V4m-5 5 5-5 5 5M4 20h16',
    refresh: 'M20 11a8 8 0 0 0-14.6-4.5L4 8m0-5v5h5M4 13a8 8 0 0 0 14.6 4.5L20 16m0 5v-5h-5',
    download: 'M12 4v12m-5-5 5 5 5-5M4 20h16',
    print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7v-7Z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
    edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
    check: 'M5 12l5 5 9-10',
    x: 'M6 6l12 12M18 6 6 18',
    ticket: 'M3 8V5h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4Zm7-3v14',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
    chevronLeft: 'M15 6l-6 6 6 6',
    chevronRight: 'M9 6l6 6-6 6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-9.5v.5'
};
</script>

<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon">
        <path :d="PATHS[name] || PATHS.info" />
    </svg>
</template>
