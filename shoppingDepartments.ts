export type ShoppingDepartmentId =
  | "meat"
  | "fish"
  | "dairy"
  | "eggs"
  | "grains"
  | "vegetables"
  | "fruits"
  | "nuts"
  | "oils"
  | "drinks"
  | "other";

export type ShoppingDepartmentItem = {
  name: string;
  checked?: boolean;
};

export type ShoppingDepartmentGroup<T extends ShoppingDepartmentItem> = {
  department: ShoppingDepartmentId;
  label: string;
  items: T[];
  checkedCount: number;
  uncheckedCount: number;
};

export const SHOPPING_DEPARTMENT_LABELS: Record<ShoppingDepartmentId, string> = {
  meat: "Мясной отдел",
  fish: "Рыбный отдел",
  dairy: "Молочный отдел",
  eggs: "Яйца",
  grains: "Крупы, макароны и хлеб",
  vegetables: "Овощи и зелень",
  fruits: "Фрукты и ягоды",
  nuts: "Орехи и семена",
  oils: "Масла и соусы",
  drinks: "Напитки",
  other: "Прочее",
};

export const SHOPPING_DEPARTMENT_ORDER: ShoppingDepartmentId[] = [
  "meat",
  "fish",
  "dairy",
  "eggs",
  "grains",
  "vegetables",
  "fruits",
  "nuts",
  "oils",
  "drinks",
  "other",
];

export function getShoppingDepartment(name: string): ShoppingDepartmentId {
  const n = name.toLowerCase();

  if (/(треск|минтай|лосос|семг|сёмг|тунец|рыб|кревет|морепродукт|скумбр|форел)/i.test(n)) {
    return "fish";
  }

  if (/(куриц|индейк|говядин|свинин|баранин|теляти|мяс|фарш|филе|грудк|бедр|печен|печён)/i.test(n)) {
    return "meat";
  }

  if (/(творог|йогурт|кефир|молок|сыр|сметан|ряженк|сливк|айран|мацон|простокваш)/i.test(n)) {
    return "dairy";
  }

  if (/(яйц|омлет)/i.test(n)) {
    return "eggs";
  }

  if (/(греч|рис|овсян|хлоп|макарон|паста|хлеб|круп|булгур|киноа|кус-?кус|перлов|пшен|лапш)/i.test(n)) {
    return "grains";
  }

  if (/(огур|помид|томат|капуст|морков|лук|перец|баклаж|кабач|цуккини|брокколи|шпинат|салат|зелень|укроп|петруш|овощ|фасоль|гриб|картоф|свекл|свёкл|редис|тыкв)/i.test(n)) {
    return "vegetables";
  }

  if (/(яблок|банан|апельсин|ягод|фрукт|груш|киви|лимон|авокад|мандарин|персик|виноград|манго|ананас)/i.test(n)) {
    return "fruits";
  }

  if (/(орех|миндаль|фундук|арахис|кешью|семен|семеч|чиа|кунжут|грецк)/i.test(n)) {
    return "nuts";
  }

  if (/(масло|соус|уксус|кетчуп|горчиц|майонез|заправк|паст[аы] томат)/i.test(n)) {
    return "oils";
  }

  if (/(вода|чай|кофе|сок|напит|компот|морс)/i.test(n)) {
    return "drinks";
  }

  return "other";
}

export function groupShoppingItemsByDepartment<T extends ShoppingDepartmentItem>(
  items: T[],
  options: { onlyUnchecked?: boolean } = {},
): ShoppingDepartmentGroup<T>[] {
  const grouped = new Map<ShoppingDepartmentId, T[]>();
  for (const department of SHOPPING_DEPARTMENT_ORDER) grouped.set(department, []);

  for (const item of items) {
    if (options.onlyUnchecked && item.checked) continue;
    const department = getShoppingDepartment(item.name);
    grouped.get(department)?.push(item);
  }

  return SHOPPING_DEPARTMENT_ORDER.flatMap((department) => {
    const departmentItems = grouped.get(department) || [];
    if (!departmentItems.length) return [];

    const sorted = [...departmentItems].sort((a, b) => {
      const checkedDelta = Number(Boolean(a.checked)) - Number(Boolean(b.checked));
      if (checkedDelta !== 0) return checkedDelta;
      return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    });

    return [{
      department,
      label: SHOPPING_DEPARTMENT_LABELS[department],
      items: sorted,
      checkedCount: sorted.filter((item) => item.checked).length,
      uncheckedCount: sorted.filter((item) => !item.checked).length,
    }];
  });
}
