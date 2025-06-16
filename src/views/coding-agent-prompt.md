Help me integrate the "vibe-icon" icon library into my project.

## One-time install

Please ensure the library is already installed. I need to have `<script src="https://esm.sh/{{ packageName }}@{{ packageVersion }}" type="module"></script>` added to the appropriate place, usually in the `<head>` section of my HTML file or the bottom of the `<body>` section.

## Use icons

The library provides a `<vibe-icon>` component that requires a `name` prop and optionally a `filled` prop and a `size` prop.

```html
<!-- regular style -->
<vibe-icon name="{{ iconName }}"></vibe-icon>

<!-- filled style -->
<vibe-icon name="{{ iconName }}" filled></vibe-icon>

<!-- custom size -->
<vibe-icon name="{{ iconName }}" size="16"></vibe-icon>
```

I specifically want to use the `{{ iconName }}` icon. If other icons are needed, I will manually find them with a [search tool]({{ searchToolUrl }}).
