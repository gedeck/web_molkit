/*
	WebMolKit

	(c) 2010-2018 Molecular Materials Informatics, Inc.

	All rights reserved
	
	http://molmatinf.com

	[PKG=webmolkit]
*/

///<reference path='FontData.ts'/>
///<reference path='../util/util.ts'/>
///<reference path='../decl/corrections.d.ts'/>

namespace WebMolKit /* BOF */ {

/*
	MetaVector: parses a vector datastructure, typically generated by the server, and allows it to be rendered or modified

	Each primitive is an array; first entry is type, the rest varies:

		[PRIM_LINE,typeidx,x1,y1,x2,y2]
		[PRIM_RECT,typeidx,x,y,w,h]
		[PRIM_OVAL,typeidx,x,y,w,h]
		[PRIM_PATH,typeidx,numPoints,xpoints[],ypoints[],ctrlFlags[],isClosed]
		[PRIM_TEXT,typeidx,x,y,txt]

	Each type is an array; first entry is type-of-type, the rest varies:

		[PRIM_LINE,thickness,colour]
		[PRIM_RECT,edgeCol,fillCol,thickness]
		[PRIM_OVAL,edgeCol,fillCol,thickness]
		[PRIM_PATH,edgeCol,fillCol,thickness,hardEdge]
		[PRIM_TEXT,size,colour]
*/

export enum TextAlign
{
	Centre = 0,
	Left = 1,
	Right = 2,
	Baseline = 0,
	Middle = 4,
	Top = 8,
	Bottom = 16
}

export class MetaVector
{
	private PRIM_LINE = 1;
	private PRIM_RECT = 2;
	private PRIM_OVAL = 3;
	private PRIM_PATH = 4;
	private PRIM_TEXT = 5;

	private ONE_THIRD = 1.0 / 3;
	
	public static NOCOLOUR = -1;

	private types:any[] = [];
	private prims:any[] = [];
	private typeObj:any[];
	public width:number = 0;
	public height:number = 0;
	public offsetX = 0;
	public offsetY = 0;
	public scale = 1;
	public density = 1;
	
	private charMask:boolean[];
	private charMissing = false;
	private lowX:number = null;
	private lowY:number = null;
	private highX:number = null;
	private highY:number = null;

	// ------------ public methods ------------

	constructor(vec?:any)
	{
		const font = FontData.main;

		this.charMask = Vec.booleanArray(false, font.UNICODE.length);

		if (vec != null)
		{
			if (vec.size != null) 
			{
				this.width = vec.size[0]; 
				this.height = vec.size[1];
			}
			if (vec.types != null) this.types = vec.types;
			if (vec.prims != null) this.prims = vec.prims;

			// extract char-mask
			for (let p of this.prims) if (p[0] == this.PRIM_TEXT)
			{
				let txt = p[4];
				for (let n = 0; n < txt.length; n++)
				{
					let i = font.getIndex(txt.charAt(n));
					if (i >= 0) this.charMask[i] = true; else this.charMissing = true;
				} 
			}
		}
	}

	// methods for adding a primitive (and possibly a type to go with it)
	public drawLine(x1:number, y1:number, x2:number, y2:number, colour:number, thickness:number)
	{
		if (thickness == null) thickness = 1;
		let typeidx = this.findOrCreateType([this.PRIM_LINE, thickness, colour]);

		const bump = 0.5 * thickness;
		this.updateBounds(Math.min(x1, x2) - bump, Math.min(y1, y2) - bump);
		this.updateBounds(Math.max(x1, x2) + bump, Math.max(y1, y2) + bump);

		this.prims.push([this.PRIM_LINE, typeidx, x1, y1, x2, y2]);
	}
	public drawRect(x:number, y:number, w:number, h:number, edgeCol:number, thickness:number, fillCol:number)
	{
		if (edgeCol == null) edgeCol = -1;
		if (fillCol == null) fillCol = -1;
		if (thickness == null) thickness = 1;
		let typeidx = this.findOrCreateType([this.PRIM_RECT, edgeCol, fillCol, thickness]);

		const bump = 0.5 * thickness;
		this.updateBounds(x - bump, y - bump);
		this.updateBounds(x + w + bump, y + h + bump);

		this.prims.push([this.PRIM_RECT, typeidx, x, y, w, h]);
	}
	public drawOval(cx:number, cy:number, rw:number, rh:number, edgeCol:number, thickness:number, fillCol:number)
	{
		if (edgeCol == null) edgeCol = -1;
		if (fillCol == null) fillCol = -1;
		if (thickness == null) thickness = 1;

		const bump = 0.5 * thickness;
		this.updateBounds(cx - rw - bump, cy - rh - bump);
		this.updateBounds(cx + rw + bump, cy + rh + bump);

		let typeidx = this.findOrCreateType([this.PRIM_OVAL, edgeCol, fillCol, thickness]);
		this.prims.push([this.PRIM_OVAL, typeidx, cx, cy, rw, rh]);
	}
	public drawPath(xpoints:number[], ypoints:number[], ctrlFlags:boolean[], isClosed:boolean, edgeCol:number, thickness:number, fillCol:number, hardEdge:boolean)
	{
		if (edgeCol == null) edgeCol = -1;
		if (fillCol == null) fillCol = -1;
		if (thickness == null) thickness = 1;
		if (hardEdge == null) hardEdge = false;		

		const bump = 0.5 * thickness;
		for (let n = 0; n < xpoints.length; n++)
		{
			// NOTE: treats control points as literals; this could cause glitches, but hasn't yet
			this.updateBounds(xpoints[n] - bump, ypoints[n] - bump);
			if (bump != 0) this.updateBounds(xpoints[n] + bump, ypoints[n] + bump); 
		}

		let typeidx = this.findOrCreateType([this.PRIM_PATH, edgeCol, fillCol, thickness, hardEdge]);
		this.prims.push([this.PRIM_PATH, typeidx, xpoints.length, clone(xpoints), clone(ypoints), clone(ctrlFlags), isClosed]);
	}
	public drawPoly(xpoints:number[], ypoints:number[], edgeCol:number, thickness:number, fillCol:number, hardEdge:boolean)
	{
		this.drawPath(xpoints, ypoints, null, true, edgeCol, thickness, fillCol, hardEdge);
	}
	public drawText(x:number, y:number, txt:string, size:number, colour:number, align?:number)
	{
		if (align == null) align = TextAlign.Left | TextAlign.Baseline;
		const font = FontData.main;
		for (let n = 0; n < txt.length; n++)
		{
			let i = font.getIndex(txt.charAt(n));
			if (i >= 0) this.charMask[i] = true; else this.charMissing = true;
		}

		let metrics = font.measureText(txt, size);
		let bx = 0, by = 0;

		if ((align & TextAlign.Left) != 0) {}
		else if ((align & TextAlign.Right) != 0) bx = -metrics[0];
		else /* centre */ bx = -0.5 * metrics[0];

		if ((align & TextAlign.Middle) != 0) by += 0.5 * metrics[1];
		else if ((align & TextAlign.Top) != 0) by += metrics[1];
		else if ((align & TextAlign.Bottom) != 0) by -= metrics[2];
		// else: baseline

		// mainstaking measurement of the boundaries (looks like overkill, but it really isn't)
		let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
		let dx = 0;
		for (let n = 0; n < txt.length; n++)
		{
			let ch = txt.charAt(n);
			let i = font.getIndex(ch);
			if (i >= 0)
			{
				let outlineX = font.getOutlineX(i), outlineY = font.getOutlineY(i);
				x1 = Math.min(x1, dx + Vec.min(outlineX));
				x2 = Math.max(x2, dx + Vec.max(outlineX));
				y1 = Math.min(y1, -Vec.max(outlineY));
				y2 = Math.max(y2, -Vec.min(outlineY));

				dx += font.HORIZ_ADV_X[i];
				if (n < txt.length - 1) dx += font.getKerning(ch, txt.charAt(n + 1));
			}
			else dx += font.MISSING_HORZ;
		}
		const mscale = size * font.INV_UNITS_PER_EM;
		this.updateBounds(x + bx + x1 * mscale, y + by + y1 * mscale);
		this.updateBounds(x + bx + x2 * mscale, y + by + y2 * mscale);

		let typeidx = this.findOrCreateType([this.PRIM_TEXT, size, colour]);
		this.prims.push([this.PRIM_TEXT, typeidx, x + bx, y + by, txt]);
	}

	// query the boundaries of the drawing, post factum
	public boundLowX():number {return this.lowX;}
	public boundLowY():number {return this.lowY;}
	public boundHighX():number {return this.highX;}
	public boundHighY():number {return this.highY;}

	// update width/height (this isn't done automatically, as it can be considered a parameter)
	public measure():void
	{
		this.width = Math.ceil(this.highX - this.lowX);
		this.height = Math.ceil(this.highY - this.lowY);
	} 

	// for a metavector that has been drawn programmatically, makes sure that origin is (0,0) and that the size is set
	public normalise():void
	{
		if (this.lowX != 0 || this.lowY != 0) this.transformPrimitives(-this.lowX, -this.lowY, 1, 1);
		this.width = Math.ceil(this.highX - this.lowX);
		this.height = Math.ceil(this.highY - this.lowY);
	}

	// convenience
	public setSize(width:number, height:number) {this.width = width; this.height = height;}

	// makes sure everything fits into the indicated box, scaling down if necessary (but not up)	
	public transformIntoBox(box:Box):void
	{
		this.transformPrimitives(-this.lowX, -this.lowY, 1, 1);
		let nw = Math.ceil(this.highX - this.lowX), nh = Math.ceil(this.highY - this.lowY);
		let scale = 1;
		if (nw > box.w)
		{
			let mod = box.w / nw;
			nw = box.w;
			nh *= mod;
			scale *= mod;
		}
		if (nh > box.h)
		{
			let mod = box.h / nh;
			nh = box.h;
			nw *= mod;
			scale *= mod;
		}
		let ox = 0.5 * (box.w - nw), oy = 0.5 * (box.h - nh);
		this.transformPrimitives(box.x + ox, box.y + oy, scale, scale);
	}
	
	// transforms the sizes and positions of the primitives; note that this should only be called within the building stage,
	// just before everything is emitted to the output device
	// scaling properties:
	//		position=(position-lowest)*scale + lowest + offset
	//		i.e., if (ox,oy) are zero, then the lower point does not change at all, but the upper bound is stretched
	public transformPrimitives(ox:number, oy:number, sw:number, sh:number):void
	{
		if (ox == 0 && oy == 0 && sw == 1 && sh == 1) return;

		for (let a of this.prims)
		{
			const type = a[0];
			if (type == this.PRIM_LINE)
			{
				a[2] = ox + ((a[2] - this.lowX) * sw + this.lowX);
				a[3] = oy + ((a[3] - this.lowY) * sh + this.lowY);
				a[4] = ox + ((a[4] - this.lowX) * sw + this.lowX);
				a[5] = oy + ((a[5] - this.lowY) * sh + this.lowY);
			}
			else if (type == this.PRIM_RECT)
			{
				a[2] = ox + ((a[2] - this.lowX) * sw + this.lowX);
				a[3] = oy + ((a[3] - this.lowY) * sh + this.lowY);
				a[4] = a[4] * sw;
				a[5] = a[5] * sh;
			}
			else if (type == this.PRIM_OVAL)
			{
				a[2] = ox + ((a[2] - this.lowX) * sw + this.lowX);
				a[3] = oy + ((a[3] - this.lowY) * sh + this.lowY);
				a[4] *= sw;
				a[5] *= sh;
			}
			else if (type == this.PRIM_PATH)
			{
				let sz = a[2], px = a[3], py = a[4];
				for (let n = 0; n < sz; n++)
				{
					px[n] = ox + ((px[n] - this.lowX) * sw + this.lowX);
					py[n] = oy + ((py[n] - this.lowY) * sh + this.lowY);
				}
			}
			else if (type == this.PRIM_TEXT)
			{
				a[2] = ox + ((a[2] - this.lowX) * sw + this.lowX);
				a[3] = oy + ((a[3] - this.lowY) * sh + this.lowY);
			}
		}
		let swsh = 0.5 * (sw + sh);
		if (swsh != 1) for (let t of this.types)
		{
			const type = t[0];
			if (type == this.PRIM_LINE) t[1] *= swsh;
			else if (type == this.PRIM_RECT) t[3] *= swsh;
			else if (type == this.PRIM_OVAL) t[3] *= swsh;
			else if (type == this.PRIM_PATH) t[3] *= swsh;
			else if (type == this.PRIM_TEXT) t[1] *= swsh;
		}

		this.highX = ox + this.lowX + (this.highX - this.lowX) * sw;
		this.highY = oy + this.lowY + (this.highY - this.lowY) * sh;
		this.lowX += ox;
		this.lowY += oy;
	}

	// renders the meta vector by creating a new canvas
	public renderInto(parent:any)
	{
		let canvas = <HTMLCanvasElement>newElement(parent, 'canvas', {'width': this.width, 'height': this.height});
		this.renderCanvas(canvas);
		return canvas;
	}

	// renders the meta vector into an existing canvas
	public renderCanvas(canvas:HTMLCanvasElement, clearFirst?:boolean)
	{
		let ctx = canvas.getContext('2d');
		if (clearFirst) ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		let w = canvas.style.width ? parseInt(canvas.style.width) : canvas.width / this.density;
		let h = canvas.style.height ? parseInt(canvas.style.height) : canvas.height / this.density;
		
		this.density = pixelDensity();
		
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		canvas.width = w * this.density;
		canvas.height = h * this.density;

		this.renderContext(ctx);
	}

	// renders the meta vector into a context (this is useful when there's stuff to draw above or below)
	public renderContext(ctx:CanvasRenderingContext2D)
	{
		ctx.save();
		ctx.scale(this.density, this.density);
		
		this.typeObj = [];
		for (let n = 0; n < this.types.length; n++)
		{
			let t = this.types[n];
			if (t[0] == this.PRIM_LINE) this.typeObj[n] = this.setupTypeLine(t);
			else if (t[0] == this.PRIM_RECT) this.typeObj[n] = this.setupTypeRect(t);
			else if (t[0] == this.PRIM_OVAL) this.typeObj[n] = this.setupTypeOval(t);
			else if (t[0] == this.PRIM_PATH) this.typeObj[n] = this.setupTypePath(t);
			else if (t[0] == this.PRIM_TEXT) this.typeObj[n] = this.setupTypeText(t);
		}
		for (let n = 0; n < this.prims.length; n++)
		{
			let p = this.prims[n];
			if (p[0] == this.PRIM_LINE) this.renderLine(ctx, p);
			else if (p[0] == this.PRIM_RECT) this.renderRect(ctx, p);
			else if (p[0] == this.PRIM_OVAL) this.renderOval(ctx, p);
			else if (p[0] == this.PRIM_PATH) this.renderPath(ctx, p);
			else if (p[0] == this.PRIM_TEXT) this.renderText(ctx, p);
		}
		
		ctx.restore();
	}

	// builds a new DOM containing an <svg> element, and everything underneath it is a representation of the graphic
	public createSVG():string
	{
		let svg = $('<svg></svg>');
		svg.attr('xmlns', 'http://www.w3.org/2000/svg'); 
		svg.attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');
		svg.attr('width', this.width);
		svg.attr('height', this.height);
		svg.attr('viewBox', '0 0 ' + this.width + ' ' + this.height);

		this.renderSVG(svg);

		// ugly but it works
		let tmp = $('<tmp></tmp>');
		tmp.append(svg);
		return tmp.html();
	}

	// given a DOM that represents an <svg> element, or some sub-container (such as <g>), populates it with all of the
	// content from the graphic
	public renderSVG(svg:JQuery):void
	{
		this.typeObj = [];

		// !! todo: alternate destination for embeddables, and check if they already exist?

		const font = FontData.main;
		let defs = $('<defs></defs>').appendTo(svg);
		if (this.charMissing)
		{
			let path = $('<path></path>').appendTo(defs);
			path.attr('id', 'missing');
			path.attr('d', font.MISSING_DATA);
			path.attr('edge', 'none');
		}
		for (let n = 0; n < font.UNICODE.length; n++) if (this.charMask[n])
		{
			let path = $('<path></path>').appendTo(defs);
			path.attr('id', 'char' + n);
			path.attr('d', font.GLYPH_DATA[n]);
			path.attr('edge', 'none');
		}

		for (let n = 0; n < this.types.length; n++)
		{
			let t = this.types[n];
			if (t[0] == this.PRIM_LINE) this.typeObj[n] = this.setupTypeLine(t);
			else if (t[0] == this.PRIM_RECT) this.typeObj[n] = this.setupTypeRect(t);
			else if (t[0] == this.PRIM_OVAL) this.typeObj[n] = this.setupTypeOval(t);
			else if (t[0] == this.PRIM_PATH) this.typeObj[n] = this.setupTypePath(t);
			else if (t[0] == this.PRIM_TEXT) this.typeObj[n] = this.setupTypeText(t);
		}
		for (let n = 0; n < this.prims.length;)
		{
			let p = this.prims[n], num = 1;
			if (p[0] != this.PRIM_PATH && p[0] != this.PRIM_TEXT)
			{
				for (; n + num < this.prims.length; num++) if (this.prims[n + num][0] != p[0] || this.prims[n + num][1] != p[1]) break;
			}
			if (p[0] == this.PRIM_LINE) 
			{
				if (num == 1) this.svgLine1(svg, p); else this.svgLineN(svg, p, n, num);
			}
			else if (p[0] == this.PRIM_RECT) 
			{
				if (num == 1) this.svgRect1(svg, p); else this.svgRectN(svg, p, n, num);
			}
			else if (p[0] == this.PRIM_OVAL) 
			{
				if (num == 1) this.svgOval1(svg, p); else this.svgOvalN(svg, p, n, num);
			}
			else if (p[0] == this.PRIM_PATH) this.svgPath(svg, p);
			else if (p[0] == this.PRIM_TEXT) this.svgText(svg, p);

			n += num;
		}
	}

	// ------------ private methods ------------

	// transform stored types into renderables
	public setupTypeLine(t:any[])
	{
		let thickness = t[1] * this.scale;
		let colour = t[2];
		return {'thickness': thickness, 'colour': colourCanvas(colour)};
	}
	public setupTypeRect(t:any[])
	{
		let edgeCol = t[1];
		let fillCol = t[2];
		let thickness = t[3] * this.scale;
		return {'edgeCol': colourCanvas(edgeCol), 'fillCol': colourCanvas(fillCol), 'thickness': thickness};
	}
	public setupTypeOval(t:any[])
	{
		let edgeCol = t[1];
		let fillCol = t[2];
		let thickness = t[3] * this.scale;
		return {'edgeCol': colourCanvas(edgeCol), 'fillCol': colourCanvas(fillCol), 'thickness': thickness};
	}
	public setupTypePath(t:any[])
	{
		let edgeCol = t[1];
		let fillCol = t[2];
		let thickness = t[3] * this.scale;
		let hardEdge = t[4];
		return {'edgeCol': colourCanvas(edgeCol), 'fillCol': colourCanvas(fillCol), 'thickness': thickness, 'hardEdge': hardEdge};
	}
	public setupTypeText(t:any[])
	{
		let sz = t[1] * this.scale;
		let colour = t[2];
		return {'colour': colourCanvas(colour), 'size': sz};
	}

	// perform actual rendering for the primitives
	public renderLine(ctx:CanvasRenderingContext2D, p:any)
	{
		let type = this.typeObj[p[1]];
		let x1 = p[2], y1 = p[3];
		let x2 = p[4], y2 = p[5];
		
		x1 = this.offsetX + this.scale * x1;
		y1 = this.offsetY + this.scale * y1;
		x2 = this.offsetX + this.scale * x2;
		y2 = this.offsetY + this.scale * y2;
		if (type.colour != null)
		{
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.strokeStyle = type.colour;
			ctx.lineWidth = type.thickness;
			ctx.lineCap = 'round';
			ctx.stroke();
		}
	}
	public renderRect(ctx:CanvasRenderingContext2D, p:any)
	{
		let type = this.typeObj[p[1]];
		let x = p[2], y = p[3];
		let w = p[4], h = p[5];

		x = this.offsetX + this.scale * x;
		y = this.offsetY + this.scale * y;
		w *= this.scale;
		h *= this.scale;

		if (type.fillCol != null)
		{
			ctx.fillStyle = type.fillCol;
			ctx.fillRect(x, y, w, h);
		}
		if (type.edgeCol != null)
		{
			ctx.strokeStyle = type.edgeCol;
			ctx.lineWidth = type.thickness;
			ctx.lineCap = 'square';
			ctx.strokeRect(x, y, w, h);
		}
	}
	public renderOval(ctx:CanvasRenderingContext2D, p:any)
	{
		let type = this.typeObj[p[1]];
		let cx = p[2], cy = p[3];
		let rw = p[4], rh = p[5];

		cx = this.offsetX + this.scale * cx;
		cy = this.offsetY + this.scale * cy;
		rw *= this.scale;
		rh *= this.scale;
		
		if (type.fillCol != null)
		{
			ctx.fillStyle = type.fillCol;
			ctx.beginPath();
			ctx.ellipse(cx, cy, rw, rh, 0, 0, 2 * Math.PI, true);
			ctx.fill();
		}
		if (type.edgeCol != null)
		{
			ctx.strokeStyle = type.edgeCol;
			ctx.lineWidth = type.thickness;
			ctx.beginPath();
			ctx.ellipse(cx, cy, rw, rh, 0, 0, 2 * Math.PI, true);
			ctx.stroke();
		}
	}
	public renderPath(ctx:CanvasRenderingContext2D, p:any)
	{
		let type = this.typeObj[p[1]];
		let npts = p[2];
		if (npts == 0) return;
		let x = p[3], y = p[4];
		let ctrl = p[5];
		let isClosed = p[6];
		
		for (let n = 0; n < npts; n++)
		{
			x[n] = this.offsetX + this.scale * x[n];
			y[n] = this.offsetY + this.scale * y[n];
		}

		for (let layer = 1; layer <= 2; layer++)
		{
			if (layer == 1 && type.fillCol == null) continue;
			if (layer == 2 && type.edgeCol == null) continue;
				
			ctx.beginPath();
			ctx.moveTo(x[0], y[0]);
			for (let i = 1; i < npts; i++)
			{
				if (!ctrl || !ctrl[i])
				{
					ctx.lineTo(x[i], y[i]);
				}
				else if (i < npts - 1 && !ctrl[i + 1])
				{
					ctx.quadraticCurveTo(x[i], y[i], x[i + 1], y[i + 1]);
					i++;
				}
				else if (i < npts - 1 && !ctrl[i + 2])
				{
					ctx.bezierCurveTo(x[i], y[i], x[i + 1], y[i + 1], x[i + 2], y[i + 2]);
					i += 2;
				}
			}
			if (isClosed) ctx.closePath();
		
			if (layer == 1)
			{
				ctx.fillStyle = type.fillCol;
				ctx.fill();
			}
			else
			{
				ctx.strokeStyle = type.edgeCol;
				ctx.lineWidth = type.thickness;
				ctx.lineCap = type.hardEdge ? 'square' : 'round';
				ctx.lineJoin = type.hardEdge ? 'miter' : 'round';
				ctx.stroke();
			}
		}
	}
	private renderText(ctx:CanvasRenderingContext2D, p:any)
	{
		let type = this.typeObj[p[1]];
		let x = p[2], y = p[3];
		let txt = p[4];
		
		let sz = type.size;
		let fill = type.colour;

		x = this.offsetX + this.scale * x;
		y = this.offsetY + this.scale * y;

		let font = FontData.main;
		
		let scale = sz / font.UNITS_PER_EM;
		let dx = 0;
		for (let n = 0; n < txt.length; n++)
		{
			let ch = txt.charAt(n);
			let i = font.getIndex(ch);
			let path:Path2D = null;
			if (i < 0)
			{
				dx += font.MISSING_HORZ;
				path = font.getMissingPath();
			}
			else path = font.getGlyphPath(i);

			if (path)
			{
				ctx.save();
				ctx.translate(x + dx * scale, y);
				ctx.scale(scale, -scale);
				ctx.fillStyle = fill;
				ctx.fill(path);
				ctx.restore();
			}
			
			dx += font.HORIZ_ADV_X[i];
			if (n < txt.length - 1) font.getKerning(ch, txt.charAt(n + 1));
		}
	}

	// create SVG object for each primitive
	// perform actual rendering for the primitives
	public svgLine1(svg:JQuery, p:any)
	{
		let type = this.typeObj[p[1]];
		let x1 = p[2], y1 = p[3];
		let x2 = p[4], y2 = p[5];
		
		x1 = this.offsetX + this.scale * x1;
		y1 = this.offsetY + this.scale * y1;
		x2 = this.offsetX + this.scale * x2;
		y2 = this.offsetY + this.scale * y2;
		
		if (type.colour != null)
		{
			let line = $('<line></line>').appendTo(svg);
			line.attr('x1', x1);
			line.attr('y1', y1);
			line.attr('x2', x2);
			line.attr('y2', y2);
			line.attr('stroke', type.colour);
			line.attr('stroke-width', type.thickness);
			line.attr('stroke-linecap', 'round');
		}
	}
	public svgLineN(svg:JQuery, p:any, pos:number, sz:number)
	{
		let type = this.typeObj[p[1]];
		if (type.colour == null) return;

		let g = $('<g></g>').appendTo(svg);
		g.attr('stroke', type.colour);
		g.attr('stroke-width', type.thickness);
		g.attr('stroke-linecap', 'round');

		for (let n = 0; n < sz; n++)
		{
			let p = this.prims[pos + n];
			let x1 = p[2], y1 = p[3];
			let x2 = p[4], y2 = p[5];
			
			x1 = this.offsetX + this.scale * x1;
			y1 = this.offsetY + this.scale * y1;
			x2 = this.offsetX + this.scale * x2;
			y2 = this.offsetY + this.scale * y2;
		
			let line = $('<line></line>').appendTo(g);
			line.attr('x1', x1);
			line.attr('y1', y1);
			line.attr('x2', x2);
			line.attr('y2', y2);
		}
	}
	public svgRect1(svg:JQuery, p:any)
	{
		let type = this.typeObj[p[1]];
		let x = p[2], y = p[3];
		let w = p[4], h = p[5];

		x = this.offsetX + this.scale * x;
		y = this.offsetY + this.scale * y;
		w *= this.scale;
		h *= this.scale;

		let rect = $('<rect></rect>').appendTo(svg);
		rect.attr('x', x);
		rect.attr('y', y);
		rect.attr('width', w);
		rect.attr('height', h);

		if (type.edgeCol != null)
		{
			rect.attr('stroke', type.edgeCol);
			rect.attr('stroke-width', type.thickness);
			rect.attr('stroke-linecap', 'square');
		}
		else rect.attr('stroke', 'none');

		rect.attr('fill', type.fillCol == null ? 'none' : type.fillCol);
	}
	public svgRectN(svg:JQuery, p:any, pos:number, sz:number)
	{
		let type = this.typeObj[p[1]];

		let g = $('<g></g>').appendTo(svg);
		
		if (type.edgeCol != null)
		{
			g.attr('stroke', type.edgeCol);
			g.attr('stroke-width', type.thickness);
			g.attr('stroke-linecap', 'square');
		}
		else g.attr('stroke', 'none');

		g.attr('fill', type.fillCol == null ? 'none' : type.fillCol);

		for (let n = 0; n < sz; n++)
		{
			let p = this.prims[pos + n];
			let x = p[2], y = p[3];
			let w = p[4], h = p[5];

			x = this.offsetX + this.scale * x;
			y = this.offsetY + this.scale * y;
			w *= this.scale;
			h *= this.scale;
			
			let rect = $('<rect></rect>').appendTo(g);
			rect.attr('x', x);
			rect.attr('y', y);
			rect.attr('width', w);
			rect.attr('height', h);
		}
	}
	public svgOval1(svg:JQuery, p:any)
	{
		let type = this.typeObj[p[1]];
		let cx = p[2], cy = p[3];
		let rw = p[4], rh = p[5];

		cx = this.offsetX + this.scale * cx;
		cy = this.offsetY + this.scale * cy;
		rw *= this.scale;
		rh *= this.scale;
		
		let oval = $('<ellipse></ellipse>').appendTo(svg);
		oval.attr('cx', cx);
		oval.attr('cy', cy);
		oval.attr('rx', rw);
		oval.attr('ry', rh);

		if (type.edgeCol != null)
		{
			oval.attr('stroke', type.edgeCol);
			oval.attr('stroke-width', type.thickness);
			oval.attr('stroke-linecap', 'square');
		}
		else oval.attr('stroke', 'none');

		oval.attr('fill', type.fillCol == null ? 'none' : type.fillCol);
	}
	public svgOvalN(svg:JQuery, p:any, pos:number, sz:number)
	{
		let type = this.typeObj[p[1]];
		let x = p[2], y = p[3];
		let w = p[4], h = p[5];

		let g = $('<g></g>').appendTo(svg);
		
		if (type.edgeCol != null)
		{
			g.attr('stroke', type.edgeCol);
			g.attr('stroke-width', type.thickness);
			g.attr('stroke-linecap', 'square');
		}
		else g.attr('stroke', 'none');

		g.attr('fill', type.fillCol == null ? 'none' : type.fillCol);

		for (let n = 0; n < sz; n++)
		{
			let p = this.prims[pos + n];
			let cx = p[2], cy = p[3];
			let rw = p[4], rh = p[5];

			cx = this.offsetX + this.scale * cx;
			cy = this.offsetY + this.scale * cy;
			rw *= this.scale;
			rh *= this.scale;

			let oval = $('<ellipse></ellipse>').appendTo(g);
			oval.attr('cx', cx);
			oval.attr('cy', cy);
			oval.attr('rx', rw);
			oval.attr('ry', rh);
		}
	}
	public svgPath(svg:JQuery, p:any)
	{
		let type = this.typeObj[p[1]];
		let npts = p[2];
		if (npts == 0) return;
		let x = p[3].slice(0), y = p[4].slice(0);
		let ctrl = p[5];
		let isClosed = p[6];
		
		for (let n = 0; n < npts; n++)
		{
			x[n] = this.offsetX + this.scale * x[n];
			y[n] = this.offsetY + this.scale * y[n];
		}

		let shape = 'M ' + x[0] + ' ' + y[0];
		let n = 1;
		while (n < npts)
		{
			if (!ctrl || !ctrl[n])
			{
				shape += ' L ' + x[n] + ' ' + y[n];
				n++;
			}
			else if (ctrl[n] && n < npts - 1 && !ctrl[n + 1])
			{
				shape += ' Q ' + x[n] + ' ' + y[n] + ' ' + x[n + 1] + ' ' + y[n + 1];
				n += 2;
			}
			else if (ctrl[n] && n < npts - 2 && ctrl[n + 1] && !ctrl[n + 2])
			{
				shape += ' C ' + x[n] + ' ' + y[n] + ' ' + x[n + 1] + ' ' + y[n + 1] + ' ' + x[n + 2] + ' ' + y[n + 2];
				n += 3;
			}
			else n++; // (dunno, so skip)
		}
		if (isClosed) shape += ' Z';		

		let path = $('<path></path>').appendTo(svg);
		path.attr('d', shape);

		if (type.edgeCol != null)
		{
			path.attr('stroke', type.edgeCol);
			path.attr('stroke-width', type.thickness);
			path.attr('stroke-linejoin', type.hardEdge ? 'miter' : 'round');
			path.attr('stroke-linecap', type.hardEdge ? 'square' : 'round');
		}
		else path.attr('stroke', 'none');

		path.attr('fill', type.fillCol == null ? 'none' : type.fillCol);
	}
	private svgText(svg:JQuery, p:any)
	{
		let type = this.typeObj[p[1]];
		let x = p[2], y = p[3];
		let txt = p[4];
		
		let sz = type.size;
		let fill = type.colour;

		x = this.offsetX + this.scale * x;
		y = this.offsetY + this.scale * y;

		let font = FontData.main;
		
		let scale = sz / font.UNITS_PER_EM;
		
		let gdelta = $('<g></g>').appendTo(svg);
		gdelta.attr('transform', 'translate(' + x + ',' + y + ')');
		gdelta.attr('fill', fill);
		let gscale = $('<g></g>').appendTo(gdelta);
		gscale.attr('transform', 'scale(' + scale + ',' + (-scale) + ')');
		
		let dx = 0;
		for (let n = 0; n < txt.length; n++)
		{
			let ch = txt.charAt(n);
			let i = font.getIndex(ch);
						
			let use = $('<use></use>').appendTo(gscale);
			let ref = i < 0 ? '#missing' : '#char' + i;
			use.attr('xlink:href', ref);
			use.attr('x', dx);

			if (i >= 0)
			{
				dx += font.HORIZ_ADV_X[i];
				if (n < txt.length - 1) dx += font.getKerning(ch, txt.charAt(n + 1));
			}
			else dx += font.MISSING_HORZ;
		}
	}	

	// for a type definition array, see if it exists in the list, and return that index - or if not, push it on
	private findOrCreateType(typeDef:any)
	{
		for (let i = 0; i < this.types.length; i++)
		{	
			if (this.types[i].length != typeDef.length) continue;
			let match = true;
			for (let j = 0; j < typeDef.length; j++) if (typeDef[j] != this.types[i][j])
			{
				match = false;
				break;
			}
			if (match) return i;
		}
		this.types.push(typeDef);
		return this.types.length - 1;
	}

	// ensures boundaries move whenever something out of range is added
	private updateBounds(x:number, y:number):void
	{
		if (this.lowX == null)
		{
			this.lowX = x;
			this.lowY = y;
			this.highX = x;
			this.highY = y;
			return;
		}
		this.lowX = Math.min(this.lowX, x);
		this.lowY = Math.min(this.lowY, y);
		this.highX = Math.max(this.highX, x);
		this.highY = Math.max(this.highY, y);
	}
}

/* EOF */ }