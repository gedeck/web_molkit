/*
    WebMolKit

    (c) 2010-2018 Molecular Materials Informatics, Inc.

    All rights reserved

    http://molmatinf.com

	[PKG=webmolkit]
*/

///<reference path='../decl/jquery/index.d.ts'/>
///<reference path='../util/util.ts'/>
///<reference path='Tooltip.ts'/>

namespace WebMolKit /* BOF */ {

/*
	Base class for widgets. Maintains the wrapping <div> element into which everything is rendered.
*/

export class Widget
{
	protected tagType = 'div';
	public content:JQuery = null;

	constructor() {}

	// create the underlying structure; the parent parameter must be jQuery-compatible
	public render(parent:any):void
	{
		let tag = this.tagType;
		this.content = $(`<${tag}></${tag}>`).appendTo($(parent));
	}

	// deconstructs the widget; this is not a hook, rather it is for the benefit of calling code that wants the widget gone
	public remove():void
	{
		if (this.content) this.content.remove();
		this.content = null;
	}

	// convenience function: attaches a tooltip to the main content element, after rendering
	public addTooltip(bodyHTML:string, titleHTML?:string):void
	{
		addTooltip(this.content, bodyHTML, titleHTML);
	}
}

/* EOF */ }