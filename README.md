![Frame](https://github.com/user-attachments/assets/d1e8f7b0-6982-4237-aa57-4c7ca5b231b0)

# Vibe Icon

[Open the Vibe Icon picker](https://aipx-proto.github.io/vibe-icon/)

<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="28" height="28" rx="4" fill="black"/>
<path d="M14.0016 24.0021C8.47785 24.0021 4 19.5243 4 14.0006C4 13.6629 4.01674 13.3291 4.04942 13H6V15H7V16H14V15H16V16H23V15H23.9538C23.4523 20.0545 19.188 24.0021 14.0016 24.0021ZM22.0038 8H5.99931C7.82399 5.57053 10.7292 3.99902 14.0016 3.99902C17.2739 3.99902 20.1791 5.57053 22.0038 8ZM9.41002 17.6589C9.08466 17.9153 9.02872 18.3869 9.28507 18.7122C10.4157 20.1472 12.1389 21.0021 14.0015 21.0021C15.8617 21.0021 17.5829 20.1495 18.7136 18.7178C18.9704 18.3927 18.915 17.9211 18.5899 17.6644C18.2649 17.4076 17.7932 17.463 17.5365 17.7881C16.6872 18.8633 15.3978 19.5021 14.0015 19.5021C12.6034 19.5021 11.3124 18.8616 10.4633 17.7839C10.2069 17.4585 9.73537 17.4026 9.41002 17.6589ZM5 9H24V12H23V14H22V15H17V14H16V12H14V14H13V15H8V14H7V12H6V11H4V10H5V9ZM3 12V11H4V12H3ZM3 12H2V14H3V12ZM9 11H8V12H9V13H10V12H9V11ZM18 11H17V12H18V13H19V12H18V11Z" fill="white"/>
</svg>

> An iconoclastic masterpiece  
> —Vibe Coder Review

> Five out of vibe stars  
> —Vibecon Awards

## Keyboard Shortcuts

| Key                                                 | Action                   | When              |
| --------------------------------------------------- | ------------------------ | ----------------- |
| <kbd>Enter</kbd>                                    | Search with AI\*         | in search box     |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>       | Focus search box         |                   |
| <kbd>↓</kbd>                                        | Focus on search results  | in search box     |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Navigate search results  | in search results |
| <kbd>Escape</kbd>                                   | Return to search box     | in search results |
| <kbd>Enter</kbd>                                    | Open icon details        | in search results |
| <kbd>Escape</kbd>                                   | Return to search results | in icon details   |
| Double click a tile                                 | Copy SVG                 |                   |

\*Search with AI requires a valid Azure OpenAI connection. Click the AI Foundry button in the corner of the screen to set it up.

## Development

1. `npm install`
2. `npm run setup`

- clones the [Fluent Icons](https://github.com/microsoft/fluentui-system-icons/) repo assets folder
- builds the public folder icons.svg

3. `npm run dev`

http://localhost:5173/vibe-icon/dev.html for development of vibe-icon web component
