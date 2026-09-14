# Wiki-tail

Wiki tail is local extension of wikipedia. Wikitail allows users to create local content that is enriched with materials from wiki worlds (wikipedia, wikidata, wikimedia commons) and possible other public sources of information (like finna.fi).


## Editing

User can write articles with markdown format. User can upload local files like images, sounds and videoa. Additionally user has tabs for Wiki-world, Commons and Finna. 


tabs:

----------------------------------------------------------------------------------------------
article | Wiki world | Commons | Finna | My Library | Local
----------------------------------------------------------------------------------------------

Each these tabs has search functionality (later maybe AI-assisted?) that allows user to browse content in these platforms and help to choose what to import.

Import saves data (snaphost) locally, so that can be shown quickly when browsing (UI would be too slow without local copy).

When content is imported, it is saved locally and moved to library. Library is a collection where used can then choose content to be used in her article or in tail.

Article tab is the text editor. There must be way to easily to use content added to library.

At the end of article editor, there is the Tail part. There user can define what library content is shown after the article. These are like posts where user can

NOTE: There is update problem. When do we update content snaphots? Do we update at all? Can update be manually triggered or constant. Anyway, we do not have to decide it yet. 

## Browsing

Browse view show content like instagram feed. You have your main article and then you have Tail, that is the content that local author has choose to shown where viewer can quickly browse content. User can also drift away to outside links (in wikipedia etc.). We have to decide if user stays in context of Wikitail or is new browser window opened. 


## Details


APIs:
https://developer.wikimedia.org/build-tools/apis/

https://www.kiwi.fi/spaces/Finna/pages/51842373/Finnan+avoin+rajapinta+Finna+API

Wikitail is a nodejs app with hapi. We need database.
For UI we could use Vue.

Wikitail is not social media.