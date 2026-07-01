import { describe, expect, it } from "vitest";
import { getShoppingDepartment, groupShoppingItemsByDepartment } from "../shoppingDepartments";

describe("shopping department grouping", () => {
  it("classifies dairy products into the dairy store department", () => {
    expect(getShoppingDepartment("Творог 5%")).toBe("dairy");
    expect(getShoppingDepartment("Йогурт греческий 2%")).toBe("dairy");
    expect(getShoppingDepartment("Кефир 2.5%")).toBe("dairy");
    expect(getShoppingDepartment("Молоко 2.5%")).toBe("dairy");
  });

  it("keeps unchecked products above bought products inside the same department", () => {
    const groups = groupShoppingItemsByDepartment([
      { name: "Говядина", checked: true },
      { name: "Куриное филе", checked: false },
      { name: "Филе индейки", checked: false },
    ]);

    const meat = groups.find((group) => group.department === "meat");
    expect(meat?.items.map((item) => item.name)).toEqual([
      "Куриное филе",
      "Филе индейки",
      "Говядина",
    ]);
    expect(meat?.uncheckedCount).toBe(2);
    expect(meat?.checkedCount).toBe(1);
  });

  it("hides bought products when only unchecked products are requested", () => {
    const groups = groupShoppingItemsByDepartment(
      [
        { name: "Творог 5%", checked: true },
        { name: "Кефир 2.5%", checked: false },
      ],
      { onlyUnchecked: true },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Молочный отдел");
    expect(groups[0].items.map((item) => item.name)).toEqual(["Кефир 2.5%"]);
  });
});
