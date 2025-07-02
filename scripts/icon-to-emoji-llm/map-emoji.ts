/* 

I need a new script that creates a json map of emoji to icon name. 
emoji is the key, icon name is the value
the same icon can be mapped to multiple emoji
we are also mapping emoji combinations - emoji + subEmoji
if an icon has subEmoji, we will map the emoji + subEmoji combination to the icon name

we want to evaluate ties right now so our output will include 2 files
1. emoji-to-icon.json
2. emoji-ties.json

emoji-to-icon.json will be a map of emoji and emoji + subEmoji to icon name
- in the case of a tie we will defer to the icon with a higher similarity score, but add it to the emoji-ties.json file
emoji-ties.json will be a map of emoji and emoji + subEmoji combination to an array of icon names

If there is anything that is not clear, please ask.

make a plan, show me the processing steps, confirm with me, and then execute.

here is the emoji-assignments.json file structure, which should be the input to this script.

```json
{
  "generated": "2025-07-02T20:58:15.516Z",
  "total": 2733,
  "assignments": [
    {
      "filename": "xbox-controller-error",
      "name": "Xbox Controller Error",
      "metaphor": ["gaming", "xbox", "controller", "device", "error", "warning", "exclamation mark"],
      "emoji": "🎮",
      "subEmoji": "❗",
      "alternativeEmojis": ["🕹️", "⚠️"],
      "similarity": 0.62
    },
    {
      "filename": "xray",
      "name": "Xray",
      "metaphor": ["doctor", "hospital", "medical", "medicine", "x-radiation", "scan", "chart"],
      "emoji": "🀄",
      "subEmoji": "",
      "alternativeEmojis": ["🎴", "🈚"],
      "similarity": 0.87
    },
    {
      "filename": "zoom-fit",
      "name": "Zoom Fit",
      "metaphor": ["point", "direction", "horizontal", "scale", "fit"],
      "emoji": "🧲",
      "subEmoji": "",
      "alternativeEmojis": ["🗺️"],
      "similarity": 0.48
    },
    {
      "filename": "zoom-in",
      "name": "Zoom In",
      "metaphor": ["zoom in", "zoom out", "magnifying glass", "search"],
      "emoji": "🔍",
      "subEmoji": "➕",
      "alternativeEmojis": ["🔎", "🧐"],
      "similarity": 0.96
    },
    {
      "filename": "zoom-out",
      "name": "Zoom Out",
      "metaphor": ["zoom in", "zoom out", "magnifying glass", "search"],
      "emoji": "🔍",
      "subEmoji": "➖",
      "alternativeEmojis": ["🔎", "🧐"],
      "similarity": 0.96
    }
  ]
}

```








*/
